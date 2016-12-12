'use strict';
const documentation = require('./documentation');
const models = require('./models');
const aws = require('./aws.js')();

class ServerlessAwsModels {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws'

    Object.assign(this, models);
    Object.assign(this, documentation(aws));

    this.customVars = this.serverless.variables.service.custom;
    const naming = this.serverless.providers.aws.naming;
    this.getMethodLogicalId = naming.getMethodLogicalId.bind(naming);
    this.normalizePath = naming.normalizePath.bind(naming);

    this._beforeDeploy = this.beforeDeploy.bind(this)
    this._afterDeploy = this.afterDeploy.bind(this)

    this.hooks = {
      'before:deploy:deploy': this._beforeDeploy,
      'after:deploy:deploy': this._afterDeploy,
    };

    this.documentationParts = [];
  }

  beforeDeploy() {
    if (!(this.customVars && this.customVars.documentation && this.customVars.documentation.models)) return;

    this.cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    // Add model resources
    const models = this.customVars.documentation.models.map(this.createCfModel)
      .reduce((modelObj, model) => {
        modelObj[`${model.Properties.Name}Model`] = model;
        return modelObj;
      }, {});
    Object.assign(this.cfTemplate.Resources, models);

    // Add models to method resources
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const func = this.serverless.service.getFunction(functionName);
      func.events.forEach(this.updateCfTemplateFromHttp.bind(this));
    });
  }

  afterDeploy() {
    if (!this.customVars.documentation || !this.customVars.documentation.version) return;
    const stackName = this.serverless.providers.aws.naming.getStackName(this.options.stage);
    return this.serverless.providers.aws.request('CloudFormation', 'describeStacks', { StackName: stackName },
      this.options.stage,
      this.options.region
    ).then(this._buildDocumentation.bind(this))
    .catch(err => {
      if (err === 'documentation version already exists, skipping upload') {
        return Promise.resolve();
      }

      return Promise.reject(err);
    });
  }

}

module.exports = ServerlessAwsModels;
