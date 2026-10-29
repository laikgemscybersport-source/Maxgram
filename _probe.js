const fs = require('fs')
const check = (file, keys) => {
  const s = fs.readFileSync(file, 'utf8')
  console.log('=== ' + file + ' len=' + s.length)
  keys.forEach((k) => console.log((s.includes(k) ? 'YES ' : 'NO  ') + k))
}
check('server.js', ['channels', 'pins', 'chatSettings', 'stories', 'presenceOf', 'canPost', 'membersOf', 'isAdmin', 'handleTaken', 'chatKeysFor', 'publicMessage', 'api/messages/:id/pin', 'api/messages/forward', 'api/chats/:key/settings', 'api/chats/:key/wallpaper', 'api/chats/:key/export', 'api/chats/:key/clear', 'api/groups', 'api/channels', 'api/discover', 'api/stories', 'exchangeOAuthCode', 'postForm', 'getJson'])
check('client/src/api.js', ['editMessage', 'pinMessage', 'forwardMessages', 'createGroup', 'createChannel', 'discover', 'chatSettings', 'uploadWallpaper', 'exportChat', 'clearHistory', 'deleteHistory', 'getStories', 'addStory', 'viewStory', 'deleteStory'])
check('client/src/components/ui.jsx', ['MessageMenu', 'SelectionBar', 'StoriesBar', 'StoryViewer', 'StoryComposer', 'EMOJI_GROUPS', 'NewChatModal', 'GroupModal', 'ChatMenu', 'WallpaperModal', 'ExportModal', 'ForwardModal', 'ProfilePanel', 'ChatHeader'])
check('client/src/components/Icons.jsx', ['IconReply', 'IconPinUp', 'IconCopy', 'IconForward', 'IconTrash', 'IconSelect', 'IconMega', 'IconEye', 'IconMoon2', 'IconBellOff', 'IconWallpaper', 'IconExport', 'IconBroom', 'IconLock', 'IconGlobe', 'IconStory', 'IconPencil2'])
check('client/src/App.jsx', ['StoriesBar', 'StoryViewer', 'StoryComposer', 'SelectionBar', 'MessageMenu', 'ChatMenu', 'WallpaperModal', 'ExportModal', 'ForwardModal', 'onChatMenuAction', 'data-darkbg', 'confirmClear', 'confirmDeleteChat'])
check('client/src/styles.css', ['ctx-menu', 'sel-bar', '.tabs', '.tab', '.stories', '.story-view', 'emoji-tabs', 'composer-ctx', 'wall-grid', 'radio-list', 'switch-row', 'member-row', 'chat-sub', 'name-ico', 'two-btns', 'join-btn', 'msg-fwd', 'msg-reply', 'pin-bar', 'msg-check', 'composer-locked', 'data-darkbg', 'story-preview'])
