"use strict";
// Synthetic cursor-agent main bundle for tweakcursor tests. NOT Anysphere code.
// Anchor strings mimic the real bundle's shape so patch fixtures stay honest.
var s={importThirdPartyPlugins:!0,loadUserLocalPlugins:!0,loadCursorFirstParty:!0};
function loadPlugins(){var a=s.importThirdPartyPlugins,o=s.loadUserLocalPlugins??!0,c=s.loadCursorFirstParty??!0;if(!a&&!c&&!o)return[];return["alpha","beta"]}
var SCAN=[[".cursor","skills"],[".cursor","skills-cursor"],[".otherharness","skills"],[".otherharness","plugins"],[".xyzagent","skills"],[".agents","skills"],[".cursor","plugins"]];
var Ds=[{configDir:".cursor",subdir:"skills",thirdParty:!1,builtin:!1},{configDir:".otherharness",subdir:"skills",thirdParty:!0,builtin:!1},{configDir:".xyzagent",subdir:"skills",thirdParty:!0,builtin:!1},{configDir:".agents",subdir:"skills",thirdParty:!1,builtin:!1}];
function Ys(t){return Ds.filter((e=>!e.builtin&&(t||!e.thirdParty)))}
var svc={currentImportSettings:{importThirdPartyPlugins:!0}};
function agentSkills(){var t=[{identifier:{source:"third-party-plugin"}},{identifier:{source:"cursor"}}];svc.currentImportSettings.importThirdPartyPlugins||(t=t.filter((function(t){return"third-party-plugin"!==t.identifier.source})));return t}
var COLORS={green:"[32m",red:"[31m",yellow:"[33m",reset:"[0m",cyan:"[36m",magenta:"[35m",gray:"[90m",gray256:"ansi256(245)"};
var DIFF_COLORS={addHex:"#D0E8C5",removeHex:"#F7D1BA",addBgHex:"#2b3f2b",removeBgHex:"#402b2b"};
var LIGHT_DIFF={addHex:"#D0E8C5",removeHex:"#F7D1BA"},DARK_DIFF={addHex:"#2b3f2b",removeHex:"#402626"};
function version(){return"2099.01.01-test"}
function banner(out){out.write("Synthetic Cursor Agent v"+version()+"\n")}
function cliProgram(cmd){return cmd.name("cursor-agent").description("Cursor Agent").option("-v, --version","Output the version number")}
function main(){if(process.argv.includes("--version")){process.stdout.write(version()+"\n");return}banner(process.stdout)}
main();
module.exports={loadPlugins,agentSkills,COLORS,DIFF_COLORS,LIGHT_DIFF,DARK_DIFF,version,banner,cliProgram};
