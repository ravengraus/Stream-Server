var rest = require('restler'),
	winston = require('winston'),
	http = require('http'),
	config = require('./config'),
	fs = require('fs');
	
// set up logger functionality
var logger = new (winston.Logger)({
	transports: [
		new (winston.transports.Console)({ colorize: true, handleExceptions: true }),
		new (winston.transports.File)({ filename: 'output.log', json: false })
	]
});

// api endpoints
var endpoint = {
	status: "/api/record",
	start: "/api/record/start",
	stop: "/api/record/stop",
	file: "/api/record/file/"
};

// api url
function apiUrl (ip, action, id) {	
	var url = "http://" + ip + endpoint[action];
	
	if (id) return (url + id);
	else return url;
}

// recording status
function recordStatus (camera, callback) {	
	rest.get(apiUrl(camera.ip, 'status'), { timeout: 5000, parser: rest.parsers.xml })
		.on('timeout', function () {
			logger.error('Request to get recording status for camera ' + camera.name + ' took too long');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			logger.error('Failed to get recording status for camera ' + camera.name);
		  }
		  else {
			if (callback) callback({ status: res.record.status[0], files: res.record.files }, camera);
		  }
		});
}

// get file
function getFile (camera, files, index, callback) {
	var filename = files[index].name[0];
	var url = apiUrl(camera.ip, 'file', filename);
	var path = __dirname+ "/downloads/" + camera.name + "/" + filename;
	var file = fs.createWriteStream(path);
	
	logger.info('Fetching ' + url + ' from camera ' + camera.name);
    
    http.get(url, function (response) {
	    response.pipe(file);
		
		file.on('finish', function() {
		  file.close(function () {
			  logger.info('Successfully downloaded file: ' + filename + ' from camera ' + camera.name);
			  if (callback) callback(camera, files, index);
		  });
		})
		.on('error', function () {
			logger.error('Error saving file ' + filename + ' to disk.');
		});
		
	})
    .on('error', function() {
	    logger.error('Could not download file: ' + filename + ' from camera ' + camera.name);
    });
}

// delete file
function deleteFile (camera, filename, callback) {
	var url = apiUrl(camera.ip, 'file', filename) + '/delete';
	
	logger.info('Deleting file: ' + filename + ' from camera ' + camera.name);
	
	rest.get(url, { timeout: 5000 })
		.on('timeout', function () {
			logger.error('Request to delete file: ' + filename + ' from camera ' + camera.name + ' took too long');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			logger.error('Could not delete file: ' + filename + ' from camera ' + camera.name);
		  }
		  else {
			if (config.develop) logger.info('Delete OK [Filename, ' + filename + ']. Response: ' + res);
			if (callback) callback();
		  }
		});
}

// start recording
function startRecord (camera, callback) {
	rest.get(apiUrl(camera.ip, 'start'), { timeout: 5000 })
		.on('timeout', function () {
			logger.error('Request to start recording on camera ' + camera.name + ' took too long');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			logger.error('Could not start recording on camera ' + camera.name);
		  }
		  else {
			if (config.develop) logger.info('Start record OK [Camera, ' + camera.name + ']. Response: ' + res);
			if (callback) callback();
		  }
		});
}

// stop recording
function stopRecord (camera, callback) {
	rest.get(apiUrl(camera.ip, 'stop'), { timeout: 5000 })
		.on('timeout', function () {
			logger.error('Request to stop recording on camera ' + camera.name + ' took too long');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			logger.error('Could not stop recording on camera ' + camera.name);
		  }
		  else {
			if (config.develop) logger.info('Stop record OK [Camera, ' + camera.name + ']. Response: ' + res);
			if (callback) callback();
		  }
		});
}

exports.status = recordStatus;
exports.stopRecord = stopRecord;
exports.startRecord = startRecord;
exports.getFile = getFile;
exports.deleteFile = deleteFile;