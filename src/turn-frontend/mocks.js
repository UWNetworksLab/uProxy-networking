// Create a mock instance of Freedom.
// We do this in a non-TypeScript file because the ambient module declaration
// prevents us creating any variable called freedom in TypeScript-land.
var freedom = jasmine.createSpyObj('spy', ['core.udpsocket', 'core.log']);
freedom.turnFrontend = jasmine.createSpy().and.returnValue(
    jasmine.createSpyObj('turnFrontend', ['providePromises']));
freedom['core.console'] = function() {
  return window.console;
};
