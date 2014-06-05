// include modules
var restify = require('restify'),
	winston = require('winston'),
	config = require('./config'),
	command = require('./command');
	
// set up rest-api server
var server = restify.createServer();

// set up logger functionality
var logger = new winston.Logger({
	transports: [
		new winston.transports.Console({ colorize: true, handleExceptions: true }),
		new winston.transports.File({ filename: 'output.log', json: false })
	]
});

// load trains from config
var trains = config.trains;

server.get("/train/:action/:id", function(req, res, next) {
	if (req.params.action == "in") {
		logger.info("Incoming train:", req.params.id);
		trainComingIn(req.params.id);
		res.send('Acknowledged. Train ' + req.params.id +  ' coming in.');
	}	
	else if (req.params.action == "out") {
		logger.info("Outgoing train:", req.params.id);
		trainGoingOut(req.params.id);
		res.send('Acknowledged. Train ' + req.params.id +  ' going out.');
	}
	else {
		logger.info("Unsupported action.");
		res.send('Unsupported request.');
	}
	next();
});

function fileSaved(camera, files, index) {
	var filename = files[index].name[0],
		offset = index + 1;
			
	var	message = 'Processed file ' + offset + ' of ' + files.length + ' for camera ' + camera.name;
		
	if (config.deleteAfterSave) {
		command.deleteFile(camera, filename, function () {
			logger.info(message);
			processFiles(camera, files, offset);
		});
	}
	else {
		logger.info(message);
		processFiles(camera, files, offset);
	}
}

function processFiles(camera, files, index) {
	if (!files || !files.length) {
		logger.info('No files to process for camera ' + camera.name);
		return;
	}
	if (index != null && index > -1) {
		if (index < files.length) {
			command.getFile(camera, files, index, fileSaved);
		}
		else {
			logger.info('Finished. All files processed for camera ' + camera.name);
		}
	}
	else {
		logger.info('Begin processing files for camera ' + camera.name);
		processFiles(camera, files, 0);
	}
}

function trainComingIn(id) {
	if (trains[id] && trains[id].length > 0) {
		var cameras = trains[id];
		
		for (var i = 0; i < cameras.length; i++) {
			var camera = cameras[i];
			
			// get status of camera
			command.status(camera, function (s) {
				logger.info('Camera ' + camera.name + ' recording status: ' + s.status);
				
				if (s.status != 'stopped') {
					// tell camera to stop recording
					command.stopRecord(camera, function () {
						// camera stopped, re-check status
						trainComingIn(id);
					});
				}
				else {
					processFiles(camera, s.files[0].file);
				}
			});
		}
	}
	else {
		logger.warn('Unknown train or train with no cameras. [id=' + id + ']');
	}
}

function trainGoingOut (id) {
	if (trains[id] && trains[id].length > 0) {
		var cameras = trains[id];
		
		for (var i = 0; i < cameras.length; i++) {
			var camera = cameras[i];
			
			// get status of camera
			command.status(camera, function (s) {
				logger.info('Camera ' + camera.name + ' recording status: ' + s.status);
				
				if (s.status != 'running') {
					// tell camera to start recording
					command.startRecord(camera, function () {
						// all done
						logger.info('Successfully started recording for camera ' + camera.name + ' on train ' + id);
					});
				}
				else {
					// unexpected state, camera is recording before going out...was not stopped coming in
					logger.error('Camera ' + camera.name + ' on train ' + id + ' should not be recording');
				}
			});
		}
	}
	else {
		logger.warn('Unknown train or train with no cameras. [id=' + id + ']');
	}
}

process.on('uncaughtException', function (err) {
	logger.error('Uncaught Exception', { message : err.message, stack : err.stack });
	process.exit(1);
});

server.listen(3000, function () {
	logger.info("Listening on port 3000.");
});

