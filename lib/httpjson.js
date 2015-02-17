var request = require("request");
var Promise = require("bluebird");

function httpjson(options) {
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