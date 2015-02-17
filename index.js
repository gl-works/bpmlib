var Promise = require("bluebird");
var httpjson = require("./lib/httpjson");

function BPM(bpengine) {
    this.bpengine = bpengine;
}

/*
 sample deployment
 =================
 {
 "id": "someDeploymentId",
 "name": "deploymentName",
 "deploymentTime": "2013-04-23T13:42:43"
 }
 */
BPM.prototype.deploymentGet = function(options) {
    if (options.name) {
        return httpjson({
            url: this.bpengine + "/deployment?name=" + encodeURIComponent(options.name),
            method: "GET"
        }).get(0);
    } else if (options.id) {
        return httpjson({
            url: this.bpengine + "/deployment/" + options.id,
            method: "GET"
        });
    } else {
        return Promise.reject(new Error("Neither name nor id specified"));
    }
};

BPM.prototype.deploymentQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/deployment/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.definitionQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/process-definition/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.processQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/process-instance/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.taskQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/task/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.taskUnassign = function(taskId) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/unclaim",
        method: "POST"
    });
};

BPM.prototype.taskAssign = function(taskId, assignee) {
    return httpjson({
        url: this.bpengine + "/task/" + taskId + "/claim",
        body: {userId: assignee},
        json: true,
        method: "POST"
    });
};


BPM.prototype.variablesQuery = function(query) {
    var segment = "";
    if (typeof query === "string") {
        segment =  query;
        query = {};
    }
    return httpjson({
        url: this.bpengine + "/variable-instance/" + segment,
        qs: query || {},
        method: "GET"
    });
};

BPM.prototype.deploymentCreate = function(name, content) {
    return Promise.using(string2stream(content), function(contentStream) {
        return httpjson({
            url: this.bpengine + "/deployment/create",
            formData: {
                'deployment-name': name,
                //'enable-duplicate-filtering': "true",
                //"deploy-changed-only": "true",
                '*': contentStream  //mandate stream of fs.createFileStream. BUG??
            },
            method: "POST"
        });
    });
};

BPM.prototype.deploymentDelete = function(deploymentId) {
    return httpjson({
        url: this.bpengine + "/deployment/" + deploymentId,
        method: "DELETE"
    });
};

module.exports = BPM;

function string2stream(text) {
    var tmp = require('tmp'), fs = require("fs");
    return new Promise(function(resolve, reject) {
        tmp.file({postfix: '.bpmn'}, function _tempFileCreated(err, path, fd, cleanupCallback) {
            if (err) {
                reject(err);
            } else {
                console.log("File: ", path);
                console.log("Filedescriptor: ", fd);
                fs["writeFile"](path, text, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(Promise.resolve(fs.createReadStream(path)).disposer(cleanupCallback))
                    }
                })
            }
        });
    })
}
