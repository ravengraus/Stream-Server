Stream-Server
=============

A server for async streaming camera actions.

TODO:
* ~~Camera entities with status events~~
* ~~Start-up initialize sequence per server and per camera~~
* ~~Retry mechanism for failed API-events~~
* ~~Controller route for camera status page~~
* ~~Trim/compact logs on server startup or interval~~

Dependencies
------------
Install required dependencies using 
```
npm install
```
from the project directory.

How to run
----------
```
node server.js
```

Notes
----------
* The app will create a directory called `downloads`. Downloaded files from a camera will be saved to a corresponding sub-directory.
* The file `config.js` contains options for train mappings to cameras, IP addresses, API endpoints, and other configurable settings.
* The config value `maxCameraFileSize` specifies total bytes for the largest allowed file that can be downloaded.
* The config values `powerOffCronRule` and `trimLogCronRule` allow camera power off and log file trimming to be scheduled respectfully following Unix style [cron](http://en.wikipedia.org/wiki/Cron) rules. To disable scheduling set value to null.
* The admin interface can be accessed while the server is running by going to the following from a browser, `http://localhost:3000/admin/`
* Requests to the server to process an incoming or outgoing train are made in the following format, `http://localhost:3000/train/{action:out|in}/{train:id}` For example, `http://localhost:3000/train/in/Train2`.
