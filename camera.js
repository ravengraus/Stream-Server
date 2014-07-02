var rest = require('restler'),
	http = require('http'),
	fs = require('fs'),
	config = require('./config'),
	Datastore = require('nedb');
	
// api url builder
function apiUrl (ip, action, id) {	
	var url = "http://" + ip + config.endpoints[action];
	
	if (id) return (url + id);
	else return url;
}

// public constructor
function Camera (name, ipAddress) {
	this.name = name;
	this.ip	= ipAddress;
	this.counter = {};
	
	var dataPath = __dirname + "/data/" + name + ".db";
	this.db = new Datastore({ filename: dataPath, autoload: true });
	
	this.canRetry = function (c) {
		(this.counter[c] != null) ? this.counter[c] = this.counter[c] + 1 : this.counter[c] = 0;
		
		if (this.counter[c] < config.maxRetry) {
			this.log('info', 'Retrying ' + c + '. Attempt ' + (this.counter[c] + 1) + ' of '  + config.maxRetry);
			return true;
		}
		else {
			return false;
		}
	};
	this.reset = function (c) {
		if (this.counter[c] != null) this.counter[c] == null;
	};
	this.log = function (level, message, callback) {
		var entry = {
			level: level,
			message: message,
			timestamp: new Date().getTime()	
		};
		this.db.insert(entry, function (err) {
			if (err && callback) callback(err);
		});
	};
}

// public fields
Camera.prototype.name = this.name;
Camera.prototype.ip = this.ip;

// log message
Camera.prototype.log = function (level, message, callback) {
	var camera = this;
	
	camera.log(level, message, function (err) {
		if (err && callback) callback(err);
	});
};

// get data
Camera.prototype.data = function (callback) {
	var camera = this;

	camera.db.find({}).sort({ timestamp: -1 }).limit(300).exec(function (err, dataset) {
	  if (err) {
		  camera.log('error', 'Error retrieving log messages from database for camera.');
		  if (callback) callback(true);
	  }
	  else {
		  if (callback) callback(false, dataset);
	  }
	});
};

// recording status
Camera.prototype.status = function (callback) {	
	var camera = this;
	
	rest.get(apiUrl(camera.ip, 'status'), { timeout: config.timeout, parser: rest.parsers.xml })
		.on('timeout', function () {
			if (camera.canRetry('status')) this.retry(1000);
			else camera.log('error', 'Request to get recording status for camera took too long.');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			if (camera.canRetry('status')) this.retry(1000);
			else camera.log('error', 'Failed to get recording status for camera.');
		  }
		  else {
			if (callback) callback({ status: res.record.status[0], files: res.record.files }, camera);
			camera.reset('status');
		  }
		});
};

// get file from device
Camera.prototype.getFile = function (files, index, callback) {
	var camera = this;
	
	var filename = files[index].name[0];
	var url = apiUrl(camera.ip, 'file', filename);
	var path = __dirname + "/downloads/" + camera.name + "/" + filename;
	var file = fs.createWriteStream(path);
	
	camera.log('info', 'Fetching ' + url + ' from camera.');
    
    function downloadFile() {
	    http.get(url, function (response) {
		    response.pipe(file);
			
			file.on('finish', function() {
			  file.close(function () {
				  camera.log('info', 'Successfully downloaded file: ' + filename + ' from camera.');
				  
				  if (callback) callback(camera, files, index);
				  camera.reset('getFile');

			  });
			})
			.on('error', function () {
				if (camera.canRetry('getFile')) setTimeout(downloadFile, 1000);
				else camera.log('error', 'Error saving file ' + filename + ' to disk.');
			});
			
		})
	    .on('error', function() {
		    if (camera.canRetry('getFile')) setTimeout(downloadFile, 1000);
		    else camera.log('error', 'Could not download file: ' + filename + ' from camera.');
	    });
	}
	
	downloadFile();
};

// delete file from device
Camera.prototype.deleteFile = function (filename, callback) {
	var camera = this;
	var url = apiUrl(camera.ip, 'file', filename) + '/delete';
	
	camera.log('info', 'Deleting file: ' + filename + ' from camera.');
	
	rest.get(url, { timeout: config.timeout })
		.on('timeout', function () {
			if (camera.canRetry('deleteFile')) this.retry(1000);
			else camera.log('error', 'Request to delete file: ' + filename + ' from camera took too long.');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			if (camera.canRetry('deleteFile')) this.retry(1000);
			else camera.log('error', 'Could not delete file: ' + filename + ' from camera.');
		  }
		  else {
			if (config.develop) camera.log('debug', 'Delete OK [Filename, ' + filename + ']. Response: ' + res);
			if (callback) callback();
			
			camera.reset('deleteFile');
		  }
		});
};

// start recording
Camera.prototype.startRecord = function (callback) {
	var camera = this;
	
	rest.get(apiUrl(camera.ip, 'start'), { timeout: config.timeout })
		.on('timeout', function () {
			if (camera.canRetry('startRecord')) this.retry(1000);
			else camera.log('error', 'Request to start recording on camera took too long.');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			if (camera.canRetry('startRecord')) this.retry(1000);
			else camera.log('error', 'Could not start recording on camera.');
		  }
		  else {
			if (config.debug) camera.log('debug', 'Start record OK [Camera, ' + camera.name + ']. Response: ' + res);
			if (callback) callback();
			
			camera.reset('startRecord');
		  }
		});
};

// stop recording
Camera.prototype.stopRecord = function (callback) {
	var camera = this;
	
	rest.get(apiUrl(camera.ip, 'stop'), { timeout: config.timeout })
		.on('timeout', function () {
			if (camera.canRetry('stopRecord')) this.retry(1000);
			else camera.log('error', 'Request to stop recording on camera took too long.');
		})
		.on('complete', function(res) {
		  if (res instanceof Error) {
			if (camera.canRetry('stopRecord')) this.retry(1000);
			else camera.log('error', 'Could not stop recording on camera.');
		  }
		  else {
			if (config.debug) camera.log('debug', 'Stop record OK [Camera, ' + camera.name + ']. Response: ' + res);
			if (callback) callback();
			
			camera.reset('stopRecord');
		  }
		});
};

module.exports = Camera;