var request = require("request");
var Promise = require("bluebird");

function httpjson(options) {
    if (options.json === undefined && typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
        (options.headers || (options.headers = {}))["Content-type"] = "application/json";
    }
    return new Promise(function(resolve, reject) {
        return request(options, function(error, response, body) {
            try {
                body = typeof body === 'string' ? JSON.parse(body) : body;
            } catch (_error) {

            }
            if (error || response.statusCode >= 400) {
                console.error('[request json]', options, error, body);
                reject(error);
            } else {
                resolve(body);
            }
        });
    });
};

module.exports = httpjson;