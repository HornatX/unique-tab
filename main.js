var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NoDuplicatePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var NoDuplicatePlugin = class extends import_obsidian.Plugin {
  async onload() {
    console.log("No Duplicate Leaves (Optimized for ALL file types) loaded");
    this.register(
      around(import_obsidian.Workspace.prototype, {
        openLinkText: (next) => {
          const plugin = this;
          return function(linktext, sourcePath, newLeaf, openViewState) {
            if (newLeaf) return next.call(this, linktext, sourcePath, newLeaf, openViewState);
            const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(
              (0, import_obsidian.getLinkpath)(linktext),
              sourcePath
            );
            if (targetFile) {
              if (activateLeafByPath(plugin.app, targetFile.path, linktext)) return;
            }
            return next.call(this, linktext, sourcePath, newLeaf, openViewState);
          };
        }
      })
    );
    this.register(
      around(import_obsidian.WorkspaceLeaf.prototype, {
        openFile: (next) => {
          const plugin = this;
          return function(file, openState) {
            const leafFound = activateLeafByPath(plugin.app, file.path, null, this, true);
            if (leafFound) {
              const isNewEmptyLeaf = this.view && !this.view.file && this.view.getViewType() === "empty";
              if (isNewEmptyLeaf) {
                const containerEl = this.containerEl;
                if (containerEl) {
                  containerEl.style.display = "none";
                }
                setTimeout(() => {
                  this.detach();
                }, 0);
              }
              return Promise.resolve();
            }
            return next.call(this, file, openState);
          };
        }
      })
    );
  }
  onunload() {
    console.log("No Duplicate Leaves unloaded");
  }
};
function activateLeafByPath(app, path, linktext = null, ignoreLeaf = null, delay = false) {
  let foundLeaf = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (foundLeaf) return;
    if (ignoreLeaf && leaf === ignoreLeaf) return;
    const viewState = leaf.getViewState();
    const leafFile = viewState.state && viewState.state.file;
    const isMatch = typeof leafFile === "string" && leafFile.length > 0 && leafFile === path;
    if (isMatch) foundLeaf = leaf;
  });
  if (foundLeaf) {
    if (delay) {
      setTimeout(() => {
        app.workspace.setActiveLeaf(foundLeaf, { focus: true });
      }, 10);
    } else {
      app.workspace.setActiveLeaf(foundLeaf, { focus: true });
    }
    if (linktext) {
      const viewState = foundLeaf.getViewState();
      if (viewState.type === "markdown") {
        setTimeout(() => scrollToElement(app, linktext, foundLeaf), 20);
      }
    }
    return true;
  }
  return false;
}
function scrollToElement(app, linktext, leaf) {
  const hashMatch = linktext.match(/(#|\^)(.*)$/);
  if (!hashMatch) return;
  const view = leaf.view;
  if (!view || !view.editor) return;
  if (!view.file) return;
  const cache = app.metadataCache.getFileCache(view.file);
  if (!cache) return;
  const type = hashMatch[1];
  const name = hashMatch[2];
  let line = -1;
  if (type === "#") {
    const heading = cache.headings?.find((h) => h.heading === name);
    if (heading) line = heading.position.start.line;
  } else if (type === "^") {
    const block = cache.blocks?.[name];
    if (block) line = block.position.start.line;
  }
  if (line >= 0) {
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
  }
}
function around(obj, factories) {
  const removers = Object.keys(factories).map((key) => {
    const prev = obj[key];
    const next = factories[key](prev);
    const original = prev;
    obj[key] = next;
    return () => {
      if (obj[key] === next) obj[key] = original;
    };
  });
  return () => removers.forEach((r) => r());
}
