"use strict";
// Synthetic chunk 8008: skill paths, spinner, status strings, update kickoff.
var SKILL_PATHS=[".cursor/skills/",".cursor/plugins/",".claude/skills/",".claude/plugins/",".codex/skills/",".grok/skills/",".agents/skills/"];
var SPINNER={frames:["a1","b2","c3","d4"],interval:250};
var STATUS={thinking:"Thinking…",responding:"Responding…",working:"Working…",done:"Done"};
function realCheck(args){return{channel:args.channel,isAutoUpdate:args.isAutoUpdate}}
function kickoffUpdate(r,er){r.disableAutoUpdate||"static"===er.channel||setTimeout((function(){realCheck({showProgress:!1,channel:er.channel,isAutoUpdate:!0,product:"agent-cli"})}),2e3).unref();return true}
module.exports={SKILL_PATHS,SPINNER,STATUS,kickoffUpdate,realCheck};
