"use strict";
// Synthetic chunk 3863: headless wiring for plugin import settings.
var h={enableMarketplacePlugins:!0,enableUserLocalPlugins:!0,enableFirstPartyPlugins:!0};
var he=h.enableMarketplacePlugins;
function makeHeadlessServices(){return{importThirdPartyPlugins:he,loadUserLocalPlugins:h.enableUserLocalPlugins,loadCursorFirstParty:h.enableFirstPartyPlugins}}
module.exports={makeHeadlessServices};
