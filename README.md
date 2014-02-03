socks-rtc
=========

Library which allows you to proxy SOCKS5 through WebRTC.

This is built on top of [freedom](https://github.com/UWNetworksLab/freedom).

At the moment this only supports chrome.

### Requirements

- node + npm
- grunt `npm install -g grunt-cli`

### Initial Setup

- Run `npm install` from the base directory to obtain all prerequisites.
- Run `grunt setup` to prepare the freedom installation. (This step should
  disappear with future versions of freedom)
- Run `grunt` which builds everything.
- Go to `chrome://extensions`, ensure developer mode is enabled, and load
  unpacked extension the `socks-rtc/chrome/` directory.
- Open the background page.

### Build
Assuming you've done initial setup:
- Run `grunt`.
- Reload extension.
