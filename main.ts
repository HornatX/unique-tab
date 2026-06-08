import { 
    App, 
    Plugin, 
    WorkspaceLeaf, 
    Workspace, 
    MarkdownView, 
    getLinkpath, 
    TFile, 
    OpenViewState
} from "obsidian";

export default class NoDuplicatePlugin extends Plugin {
    async onload() {
        console.log("No Duplicate Leaves (Optimized for ALL file types) loaded");

        // 1. 拦截 openLinkText (通过链接点击打开)
        this.register(
            around(Workspace.prototype, {
                openLinkText: (next: any) => {
                    const plugin = this; // 缓存插件实例以获取 plugin.app
                    return function (this: Workspace, linktext: string, sourcePath: string, newLeaf?: boolean | "split" | "tab" | "window", openViewState?: OpenViewState) {
                        if (newLeaf) return next.call(this, linktext, sourcePath, newLeaf, openViewState);

                        const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(
                            getLinkpath(linktext),
                            sourcePath
                        );

                        if (targetFile) {
                            if (activateLeafByPath(plugin.app, targetFile.path, linktext)) return;
                        }
                        return next.call(this, linktext, sourcePath, newLeaf, openViewState);
                    };
                },
            })
        );

        // 2. 拦截 openFile (通过文件树或快速切换打开)
        this.register(
            around(WorkspaceLeaf.prototype, {
                openFile: (next: any) => {
                    const plugin = this;
                    return function (this: WorkspaceLeaf, file: TFile, openState?: OpenViewState) {
                        // 尝试跳转到旧标签页
                        const leafFound = activateLeafByPath(plugin.app, file.path, null, this, true);
                        
                        if (leafFound) {
                            // 检查当前 leaf 是否是新创建的空 leaf
                            // @ts-ignore: file 属性在不同 View 上的强类型可能不存在
                            const isNewEmptyLeaf = this.view && !this.view.file && this.view.getViewType() === "empty";
                            
                            if (isNewEmptyLeaf) {
                                // 【极速隐身】
                                // @ts-ignore: containerEl 属于未完全暴露的 DOM API
                                const containerEl = this.containerEl as HTMLElement;
                                if (containerEl) {
                                    containerEl.style.display = "none";
                                }
                                
                                // 立即销毁
                                setTimeout(() => {
                                    this.detach(); 
                                }, 0);
                            }

                            return Promise.resolve(); 
                        }

                        return next.call(this, file, openState);
                    };
                },
            })
        );
    }

    onunload() {
        console.log("No Duplicate Leaves unloaded");
    }
}

// --- 辅助函数 ---

function activateLeafByPath(app: App, path: string, linktext: string | null = null, ignoreLeaf: WorkspaceLeaf | null = null, delay: boolean = false): boolean {
    let foundLeaf: WorkspaceLeaf | null = null;
    
    app.workspace.iterateAllLeaves((leaf) => {
        if (foundLeaf) return;
        if (ignoreLeaf && leaf === ignoreLeaf) return;

        const viewState = leaf.getViewState();
        
        // 【核心修改点】：不再限制只对 markdown 和 kanban 生效。
        // 只要这个标签页当前绑定的文件路径等于我们要打开的路径，直接判定为匹配！
        // 额外校验 file 必须是非空字符串，防止 undefined/空值误匹配
        const leafFile = viewState.state && viewState.state.file;
        const isMatch = 
            typeof leafFile === 'string' &&
            leafFile.length > 0 &&
            leafFile === path;

        if (isMatch) foundLeaf = leaf;
    });

    if (foundLeaf) {
        // 延迟解决焦点抢占
        if (delay) {
            setTimeout(() => {
                app.workspace.setActiveLeaf(foundLeaf as WorkspaceLeaf, { focus: true });
            }, 10);
        } else {
            app.workspace.setActiveLeaf(foundLeaf, { focus: true });
        }

        // 如果是通过链接点过来的（带有 # 标题定位），且目标是普通笔记，才执行滚动跳转
        if (linktext) {
             const viewState = (foundLeaf as WorkspaceLeaf).getViewState();
             // 白板和数据库通常不支持这种滚动锚点，所以这里保留 markdown 限制以防报错
             if (viewState.type === "markdown") {
                 setTimeout(() => scrollToElement(app, linktext, foundLeaf as WorkspaceLeaf), 20);
             }
        }
        return true;
    }
    return false;
}

function scrollToElement(app: App, linktext: string, leaf: WorkspaceLeaf) {
    const hashMatch = linktext.match(/(#|\^)(.*)$/);
    if (!hashMatch) return; 

    // 使用 MarkdownView 断言以获取 editor
    const view = leaf.view as MarkdownView;
    if (!view || !view.editor) return;
    if (!view.file) return;

    const cache = app.metadataCache.getFileCache(view.file);
    if (!cache) return;

    const type = hashMatch[1];
    const name = hashMatch[2];

    let line = -1;

    if (type === "#") {
        const heading = cache.headings?.find(h => h.heading === name);
        if (heading) line = heading.position.start.line;
    } else if (type === "^") {
        const block = cache.blocks?.[name];
        if (block) line = block.position.start.line;
    }

    if (line >= 0) {
        view.editor.setCursor({ line: line, ch: 0 });
        view.editor.scrollIntoView({ from: { line: line, ch: 0 }, to: { line: line, ch: 0 } }, true);
    }
}

// 代理拦截函数 (Monkey Patching)
// 返回一个清理函数，供 this.register 注册，确保在插件禁用时能够正确卸载钩子
function around(obj: any, factories: any): () => void {
    const removers = Object.keys(factories).map((key) => {
        const prev = obj[key];
        const next = factories[key](prev);
        const original = prev;
        obj[key] = next;
        return () => {
            if (obj[key] === next) obj[key] = original;
        };
    });
    // Obsidian 的 this.register() 接收一个 function 作为参数
    return () => removers.forEach((r) => r());
}