# third_party

This directory contains open-source third party code.

## Requirements

Assuming you have npm installed.

Use npm to install the `tsd` package with:  
```
sudo npm install tsd -g
```

## How to update

### TypeScipt Definitions

The `tsd.json` file (see https://github.com/DefinitelyTyped/tsd) contains references to TypeScript definitions that we use. The latest version of the definitions can be downloaded and written into the `typings` directory by running the command

`tsd update -s -o`
