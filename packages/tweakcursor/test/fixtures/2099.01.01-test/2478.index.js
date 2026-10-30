"use strict";
// Synthetic chunk 2478: executor wiring with hardcoded third-party gates.
var u=!1;
function makeBareExecutor(){return{importThirdPartyPlugins:u}}
function makeCloudExecutor({getThirdPartyExtensibilityEnabled:j=()=>!0}={}){return{getThirdPartyExtensibilityEnabled:j}}
module.exports={makeBareExecutor,makeCloudExecutor};
