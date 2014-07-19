// include modules
var restify = require('restify'),
    config = require('./config'),
    camera = require('./camera'),
    Datastore = require('nedb'),
    schedule = require('node-schedule'),
    fs = require('fs');
    
// set up rest-api server
var server = restify.createServer();

// set up logging
var system = new Datastore({ filename: __dirname + '/data/system.db', autoload: true });

system.log = function (level, message, print) {
    var entry = {
        level: level,
        message: message,
        timestamp: new Date().getTime() 
    };
    if (level == 'error' || print) {
        console.log(message);   
    }
    system.insert(entry, function (err) {
        if (err) console.log('Error: Unable to log system messages.', err);
    });
};

// set up scheduled power off
var job;

if (config.powerOffCronRule) {
    job = schedule.scheduleJob(config.powerOffCronRule, function() {
        powerCycle('powerOff');
    });
}

// load trains from config
var trains = config.trains,
    trainsJson = JSON.stringify(trains);

function startup() {
    // ensure download directory for cameras exist
    fs.mkdir(__dirname + '/downloads', 0777, function(err) {
        if (err && err.code != 'EEXIST') {
            system.log('error', 'Directory for saving camera downloads does not exist.');
        }
    });
    // load cameras
    for (var i = 0; i < trains.length; i++) {
        var cameras = trains[i].cameras;

        for (var j = 0; j < cameras.length; j++) {
            // load camera
            cameras[j].camera = new camera(cameras[j].name, cameras[j].ip);
            
            // activate camera
            initialize(cameras[j].camera);
        }
    }
}

function initialize(camera) {
    // TODO: trim camera log
    
    camera.status(function (s, c) {
        camera.log('info', 'Camera online.');
        system.log('info', 'Camera ' + c.name + ' is online.');
    });
}

function powerCycle(mode) {
    for (var i = 0; i < trains.length; i++) {
        var cameras = trains[i].cameras;

        for (var j = 0; j < cameras.length; j++) {
            cameras[j].camera.power(mode);
        }
    }
    system.log('info', 'Command ' + mode + ' sent to all cameras on all trains. Check camera log for power status.');   
}

// route for power cycling cameras
server.get('/system/power/:mode', function(req, res, next) {
    var mode = req.params.mode;

    if (mode == 'powerOn' || mode == 'powerOff') {
        powerCycle(mode);
        res.send('Command sent.');
        next();
    }
    else {
        res.send('Unsupported request.');
        next();
    }
});

// route for train actions
server.get('/train/:action/:id', function(req, res, next) {
    var id = req.params.id,
        action = req.params.action,
        train = null;
    
    for (var i = 0; i < trains.length; i++) {
        if (trains[i].id == id) train = trains[i];
    }
    
    if (train == null) {
        system.log('info', 'Unknown train or train with no cameras. [id=' + id + ']');
        res.send('Unsupported request.');
        next();
    }
    else {
        var callback, 
            cameras = train.cameras;

        if (action == 'in') {
            callback = incomingStatus;
            
            system.log('info', 'Incoming train: ' + id);
            res.send('Acknowledged. Train ' + id +  ' coming in.');
        }   
        else if (action == 'out') {
            callback = outgoingStatus;
            
            system.log('info', 'Outgoing train: ' + id);
            res.send('Acknowledged. Train ' + id +  ' going out.');
        }
        else {
            res.send('Unsupported request.');
        }
        
        for (var j = 0; j < cameras.length; j++) {
            // get status of camera
            cameras[j].camera.status(callback);
        }
        next();
    }
});

// route for train configuration
server.get('/data/config/train', function (req, res, next) {
    var data = { };
    data.trains = JSON.parse(trainsJson)
    
    res.send(data);
    next();
});

// route for system data
server.get('/data/system', function (req, res, next) {
    system.find({}).sort({ timestamp: -1 }).limit(300).exec(function (err, dataset) {
      if (err) {
          system.log('error', 'Error retrieving system messages from database.');
          res.send('Error.');
      }
      else {
          res.send(dataset);
      }
      next();
    });
});

// route for camera data
server.get('/data/camera/:name', function (req, res, next) {    
    var camera;
    
    if (req.params.name) {
        // find camera
        for (var i = 0; i < trains.length; i++) {
            var cameras = trains[i].cameras;
            
            for (var j = 0; j < cameras.length; j++) {
                if (cameras[j].camera.name == req.params.name) {
                    camera = cameras[j].camera;
                    break;
                }
            }
            if (camera) break;
        }
        if (camera) {
            // get log data
            camera.data(function (err, dataset) {
                if (err) {
                    system.log('error', 'Failed to get event log for camera ' + camera.name + '.');
                    res.send('Error.');
                }
                else {
                    res.send(dataset);
                }
                next();
            });
        }
        else {
            res.send('Error. Camera not found.');
            next();
        }
    }
    else {
        res.send('Error. Unsupported request.');
        next();
    }
});

// route to serve static content (e.g. admin console)
server.get(/\/admin\/?.*/, restify.serveStatic({
  directory: './public',
  default: 'index.html'
}));

function fileSaved(camera, files, index) {
    var filename = files[index].name[0],
          offset = index + 1;
            
    var message = 'Processed file ' + offset + ' of ' + files.length + ' for camera ' + camera.name;
        
    if (config.deleteFromCamera) {
        camera.deleteFile(filename, function () {
            system.log('info', message);
            processFiles(camera, files, offset);
        });
    }
    else {
        system.log('info', message);
        processFiles(camera, files, offset);
    }
}

function processFiles(camera, files, index) {
    if (!files || !files.length) {
        system.log('info', 'No files to process for camera ' + camera.name);
        return;
    }
    if (index != null && index > -1) {
        if ((index + 1) == files.length) {
            // check the filesize of the most recent file
            var filesize = files[index].size[0];

            // get file if within limit
            if (filesize < config.maxCameraFileSize) {
                camera.getFile(files, index, fileSaved);
            }
            else {
                // delete file
                fileSaved(camera, files, index);
            }
        }
        else if (index < files.length) {
            // camera has multiple files, delete
            fileSaved(camera, files, index);
        }
        else {
            system.log('info', 'Finished. All files processed for camera ' + camera.name);
        }
    }
    else {
        system.log('info', 'Begin processing files for camera ' + camera.name);
        processFiles(camera, files, 0);
    }
}

function incomingStatus (s, c) {
    system.log('info', 'Camera ' + c.name + ' recording status: ' + s.status);
    
    if (s.status != 'stopped') {
        // tell camera to stop recording
        c.stopRecord(function () {
            // camera stopped, re-check status
            c.status(incomingStatus);
        });
    }
    else {
        processFiles(c, s.files[0].file);
    }           
}

function outgoingStatus (s, c) {
    system.log('info', 'Camera ' + c.name + ' recording status: ' + s.status);
    
    if (s.status != 'running') {
        // tell camera to start recording
        c.startRecord(function () {
            // all done
            system.log('info', 'Successfully started recording for camera ' + c.name + ' on train ' + id);
        });
    }
    else {
        // unexpected state, camera is recording before going out...was not stopped coming in
        system.log('info', 'Camera ' + c.name + ' on train ' + id + ' should not be recording');
    }
}

process.on('uncaughtException', function (err) {
    system.log('error', 'Uncaught exception: ' + err.message);
    if (config.debug) system.log('error', 'Stack trace: ' + err.stack);

    process.exit(1);
});

startup();

server.listen(3000, function () {
    system.log('info', 'Server up. Listening on port 3000.', true);
});

