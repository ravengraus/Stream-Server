var net = require('net'),
	config = require('./config');

exports.startTrain = function (trainIndex) {
	var client = new net.Socket(),
		options = { port: config.pimms.port, host: config.pimms.server, localAddress: config.pimms.trigger };

	client.connect(options, function () {
	    console.log('Connected to remote host.');

	    client.end(config.pimms.startData.slice(0).push(trainIndex));

	    client.destroy();
	})

	client.on('error', function (e) { 
		console.log('Error connecting to remote host', e);
	});
};

exports.trigger = function () {
	var client = new net.Socket(),
		options = { port: config.pimms.port, host: config.pimms.server, localAddress: config.pimms.trigger };

	client.connect(options, function () {
	    console.log('Connected to remote host.');

	    client.end(config.pimms.triggerData);

	    client.destroy();
	});

	client.on('error', function (e) { 
		console.log('Error connecting to remote host', e);
	});
};

exports.readyToDownload = function (trainIpAddress) {
	var client = new net.Socket(),
		options = { port: config.pimms.port, host: config.pimms.server, localAddress: trainIpAddress };

	client.connect(options, function () {
	    console.log('Connected to remote host.');
	    
	    client.end(config.pimms.logOnData);
	    client.destroy();
	});

	client.on('error', function (e) { 
		console.log('Error connecting to remote host', e);
	});
};