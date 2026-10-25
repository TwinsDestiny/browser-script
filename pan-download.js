// ==UserScript==
// @name              网盘下载助手
// @namespace         https://greasyfork.org/zh-CN/users/810690-twinsdestiny
// @version           1.0.0
// @author            TwinsDestiny
// @description       支持百度网盘、阿里云盘、天翼云盘、迅雷云盘、夸克网盘、移动云盘的 API 直链下载和 cURL 命令复制，使用内嵌静态配置，无需公众号启用验证。参考https://github.com/syhyz1990/baiduyun
// @license           MIT
// @updateURL         none
// @downloadURL       none
// @match             *://pan.baidu.com/disk/home*
// @match             *://yun.baidu.com/disk/home*
// @match             *://pan.baidu.com/disk/main*
// @match             *://yun.baidu.com/disk/main*
// @match             *://pan.baidu.com/s/*
// @match             *://yun.baidu.com/s/*
// @match             *://pan.baidu.com/share/*
// @match             *://yun.baidu.com/share/*
// @match             *://openapi.baidu.com/*
// @match             *://www.aliyundrive.com/s/*
// @match             *://www.aliyundrive.com/drive*
// @match             *://www.alipan.com/s/*
// @match             *://www.alipan.com/drive*
// @match             *://cloud.189.cn/web/*
// @match             *://pan.xunlei.com/*
// @match             *://pan.quark.cn/*
// @match             *://yun.139.com/*
// @match             *://caiyun.139.com/*
// @require           https://unpkg.com/jquery@3.7.0/dist/jquery.min.js
// @require           https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.all.min.js
// @require           https://unpkg.com/js-md5@0.7.3/build/md5.min.js
// @connect           baidu.com
// @connect           baidupcs.com
// @connect           aliyundrive.com
// @connect           alipan.com
// @connect           189.cn
// @connect           xunlei.com
// @connect           quark.cn
// @connect           yun.139.com
// @connect           caiyun.139.com
// @connect           *
// @run-at            document-idle
// @grant             unsafeWindow
// @grant             GM_xmlhttpRequest
// @grant             GM_setClipboard
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_deleteValue
// @grant             GM_openInTab
// @grant             GM_info
// @grant             GM_cookie
// @grant             GM_cookie.list
// @grant             window.close
// ==/UserScript==

(function () {
    'use strict';

    /** 当前页面类型：个人网盘或分享页面。 */
    let pt = '';
    /** 当前勾选的网盘文件列表。 */
    let selectList = [];
    /** 百度分享页面的鉴权及转存参数。 */
    let params = {};
    /** 当前下载模式，仅使用 api 或 curl。 */
    let mode = '';
    /** 下载列表弹窗宽度，单位为像素。 */
    const width = 800;
    /** 当前网盘使用的内嵌接口、选择器及界面文案。 */
    let pan = {};
    /** 用于注册页面委托事件的 jQuery 文档对象。 */
    const doc = $(document);
    /** 百度浏览器下载的逐文件进度。 */
    let progress = {};
    /** 可取消的逐文件下载请求。 */
    let request = {};
    /** 更新逐文件下载进度的定时器。 */
    let ins = {};
    /** 下载请求是否已由 IDM 接管。 */
    let idm = {};
    /** 固定主题颜色，不读取旧版助手设置。 */
    const color = '#09AAFF';

    /** API 和 cURL 下载弹窗的本地标题与说明。 */
    const downloadDialogs = {
        /** 浏览器或已安装下载工具使用的直链下载界面。 */
        api: ['API 下载', '点击链接下载文件；浏览器下载也可由已安装的下载工具接管。'],
        /** 将命令复制到当前系统终端执行，文件保存在终端工作目录。 */
        curl: ['cURL 下载', '点击命令或“复制全部命令”后粘贴到终端执行，支持断点续传。'],
    };

    /** 六种网盘的内嵌配置，依据 2026-10-25 下载的 6.2.7 配置快照维护。 */
    const panConfigs = {
        /** 百度网盘的接口与页面适配参数。 */
        baidu: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 批量查询个人盘文件及下载直链。 */
                0: "https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas&dlink=1",
                /** 获取个人盘 access token 的 OAuth 授权入口。 */
                3: "https://openapi.baidu.com/oauth/2.0/authorize?client_id=IlLqBbU3GjQ0t46TRwFateTprHWl39zF&response_type=token&redirect_uri=oob&confirm_login=0&scope=basic,netdisk",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".tcuLAu",
                /** 百度新版个人网盘页的按钮挂载位置。 */
                main: ".wp-s-agile-tool-bar__header",
                /** 分享页的按钮挂载位置。 */
                share: ".module-share-top-bar .x-button-box",
            },
            /** 下载接口要求的 User-Agent。 */
            ua: "pan.baidu.com",
        },
        /** 阿里云盘/阿里盘的接口与页面适配参数。 */
        ali: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 获取分享文件下载链接。 */
                0: "https://api.aliyundrive.com/v2/file/get_share_link_download_url",
                /** 获取个人盘文件下载链接。 */
                1: "https://api.aliyundrive.com/v2/file/get_download_url",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".actions--M9Np-",
                /** 分享页的按钮挂载位置。 */
                share: ".right--x0Z1g",
            },
            /** 阿里网盘列表与视图切换的 CSS 选择器。 */
            dom: {
                /** 读取选中文件的列表视图。 */
                list: "[class^=\"node-list-table-view--\"]",
                /** 检测当前是否为网格视图。 */
                grid: "[class^=\"node-list-grid-view--\"]",
                /** 切换到列表视图的按钮。 */
                switch: "[class^=\"switch-wrapper--\"]",
            },
        },
        /** 天翼云盘的接口与页面适配参数。 */
        tianyi: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 通过单点登录跳转获取 accessToken。 */
                1: "https://api.cloud.189.cn/open/oauth2/ssoH5.action",
                /** 通过文件 ID 和请求签名获取下载链接。 */
                2: "https://api.cloud.189.cn/open/file/getFileDownloadUrl.action",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".nav-opea",
                /** 分享页的按钮挂载位置。 */
                share: ".nav-opea",
            },
        },
        /** 迅雷云盘的接口与页面适配参数。 */
        xunlei: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 按文件 ID 获取文件详情及下载链接。 */
                0: "https://api-pan.xunlei.com/drive/v1/files/",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".FileMenu__menu--XBFEH",
                /** 分享页的按钮挂载位置。 */
                share: ".Share__batchActionBox--VKPyR",
            },
        },
        /** 夸克网盘的接口与页面适配参数。 */
        quark: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 批量获取文件下载链接。 */
                0: "https://drive.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".btn-operate .btn-main",
                /** 分享页的按钮挂载位置。 */
                share: ".file-info-share-buttom",
            },
            /** 下载接口要求的 User-Agent。 */
            ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
        },
        /** 移动云盘的接口与页面适配参数。 */
        yidong: {
            /** 沿用原脚本的数字索引，配置地址不再从服务器下发。 */
            pcs: {
                /** 获取个人盘文件下载链接。 */
                0: "https://yun.139.com/orchestration/personalCloud/uploadAndDownload/v1.0/downloadRequest",
                /** 获取分享文件下载链接。 */
                1: "https://caiyun.139.com/stapi/outlink/content/download",
            },
            /** 下载入口的 CSS 选择器。 */
            btn: {
                /** 个人网盘页的按钮挂载位置。 */
                home: ".top_button",
                /** 分享页的按钮挂载位置。 */
                share: ".top-btns",
            },
        },
    };

    /** 脚本管理器名称，用于选择兼容的百度授权流程。 */
    const manageHandler = GM_info.scriptHandler;
    /** 脚本管理器版本，用于判断百度授权处理方式。 */
    const manageVersion = GM_info.version;
    /** 下载弹窗的样式类名映射。 */
    const customClass = {
        /** 弹窗根节点。 */
        popup: 'pl-popup',
        /** 弹窗标题栏。 */
        header: 'pl-header',
        /** 弹窗标题。 */
        title: 'pl-title',
        /** 关闭按钮。 */
        closeButton: 'pl-close',
        /** 下载列表内容区域。 */
        content: 'pl-content',
        /** 弹窗输入组件。 */
        input: 'pl-input',
        /** 下载说明页脚。 */
        footer: 'pl-footer'
    };

    /** 短消息提示使用的 SweetAlert 实例。 */
    let toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: false,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    /** 各类操作结果的短消息提示。 */
    const message = {
        /** 显示操作成功提示。 */
        success: (text) => {
            toast.fire({title: text, icon: 'success'});
        },
        /** 显示操作失败提示。 */
        error: (text) => {
            toast.fire({title: text, icon: 'error'});
        },
        /** 显示警告提示。 */
        warning: (text) => {
            toast.fire({title: text, icon: 'warning'});
        },
        /** 显示信息提示。 */
        info: (text) => {
            toast.fire({title: text, icon: 'info'});
        },
        /** 显示待确认事项提示。 */
        question: (text) => {
            toast.fire({title: text, icon: 'question'});
        }
    };

    /** 下载助手的存储、请求、命令和界面公共工具。 */
    let base = {

        /** 根据浏览器所在操作系统选择 cURL 可执行文件，忽略旧终端设置。 */
        getCurlCommand() {
            const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
            return /win/i.test(platform) ? 'curl.exe' : 'curl';
        },

        /** 读取当前页面可访问的指定 Cookie。 */
        getCookie(name) {
            let cname = name + "=";
            let ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i].trim();
                if (c.indexOf(cname) == 0) return c.substring(cname.length, c.length);
            }
            return "";
        },

        /** 获取值的标准类型名称。 */
        isType(obj) {
            return Object.prototype.toString.call(obj).replace(/^\[object (.+)\]$/, '$1').toLowerCase();
        },

        /** 读取油猴存储中的下载鉴权状态。 */
        getValue(name) {
            return GM_getValue(name);
        },

        /** 保存油猴存储中的下载鉴权状态。 */
        setValue(name, value) {
            GM_setValue(name, value);
        },

        /** 删除失效的下载鉴权状态。 */
        deleteValue(name) {
            GM_deleteValue(name);
        },

        /** 读取页面本地存储，并尝试解析 JSON。 */
        getStorage(key) {
            try {
                return JSON.parse(localStorage.getItem(key));
            } catch (e) {
                return localStorage.getItem(key);
            }
        },

        /** 保存页面本地存储，自动序列化对象和数组。 */
        setStorage(key, value) {
            if (this.isType(value) === 'object' || this.isType(value) === 'array') {
                return localStorage.setItem(key, JSON.stringify(value));
            }
            return localStorage.setItem(key, value);
        },

        /** 将生成的命令或文件名复制到剪贴板。 */
        setClipboard(text) {
            GM_setClipboard(text, 'text');
        },

        /** 将 UTF-8 文本编码为 Base64，用于移动云盘签名。 */
        e(str) {
            return btoa(unescape(encodeURIComponent(str)));
        },

        /** 提取文件扩展名供下载提示使用。 */
        getExtension(name) {
            const reg = /(?!\.)\w+$/;
            if (reg.test(name)) {
                let match = name.match(reg);
                return match[0].toUpperCase();
            }
            return '';
        },

        /** 将文件大小转换为便于阅读的单位。 */
        sizeFormat(value) {
            if (value === +value) {
                let unit = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
                let index = Math.floor(Math.log(value) / Math.log(1024));
                let size = value / Math.pow(1024, index);
                size = size.toFixed(1);
                return size + unit[index];
            }
            return '';
        },

        /** 按中文文件名排序下载结果。 */
        sortByName(arr) {
            /** 创建按文件名比较的排序函数。 */
            const handle = () => {
                return (a, b) => {
                    const p1 = a.filename ? a.filename : a.server_filename;
                    const p2 = b.filename ? b.filename : b.server_filename;
                    return p1.localeCompare(p2, "zh-CN");
                };
            };
            arr.sort(handle());
        },

        /** 替换文件名中不适合下载命令的字符。 */
        fixFilename(name) {
            return name.replace(/[!?&|`"'*\/:<>\\]/g, '_');
        },

        /** 将下载完成的 Blob 保存为浏览器文件。 */
        blobDownload(blob, filename) {
            if (blob instanceof Blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        },

        /** 通过油猴跨域接口发送 POST 请求。 */
        post(url, data, headers, type) {
            if (this.isType(data) === 'object') {
                data = JSON.stringify(data);
            }
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST", url, headers, data,
                    responseType: type || 'json',
                    onload: (res) => {
                        type === 'blob' ? resolve(res) : resolve(res.response || res.responseText);
                    },
                    onerror: (err) => {
                        reject(err);
                    },
                });
            });
        },

        /** 通过油猴跨域接口读取数据或下载文件并记录进度。 */
        get(url, headers, type, extra) {
            return new Promise((resolve, reject) => {
                let requestObj = GM_xmlhttpRequest({
                    method: "GET", url, headers,
                    responseType: type || 'json',
                    onload: (res) => {
                        if (res.status === 204) {
                            requestObj.abort();
                            idm[extra.index] = true;
                        }
                        if (type === 'blob') {
                            res.status === 200 && base.blobDownload(res.response, extra.filename);
                            resolve(res);
                        } else {
                            resolve(res.response || res.responseText);
                        }
                    },
                    onprogress: (res) => {
                        if (extra && extra.filename && extra.index) {
                            res.total > 0 ? progress[extra.index] = (res.loaded * 100 / res.total).toFixed(2) : progress[extra.index] = 0.00;
                        }
                    },
                    onloadstart() {
                        extra && extra.filename && extra.index && (request[extra.index] = requestObj);
                    },
                    onerror: (err) => {
                        reject(err);
                    },
                });
            });
        },

        /** 跟随请求跳转并读取最终地址以提取凭证。 */
        getFinalUrl(url, headers) {
            return new Promise((resolve, reject) => {
                let requestObj = GM_xmlhttpRequest({
                    method: "GET", url, headers,
                    onload: (res) => {
                        resolve(res.finalUrl)
                    },
                    onerror: (err) => {
                        reject(err);
                    }
                });
            });
        },

        /** 将对象转换为表单查询字符串。 */
        stringify(obj) {
            let str = '';
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    var value = obj[key];
                    if (Array.isArray(value)) {
                        for (var i = 0; i < value.length; i++) {
                            str += encodeURIComponent(key) + '=' + encodeURIComponent(value[i]) + '&';
                        }
                    } else {
                        str += encodeURIComponent(key) + '=' + encodeURIComponent(value) + '&';
                    }
                }
            }
            return str.slice(0, -1); // 去掉末尾的 "&"
        },

        /** 避免重复插入助手样式。 */
        addStyle(id, tag, css) {
            tag = tag || 'style';
            let doc = document, styleDom = doc.getElementById(id);
            if (styleDom) return;
            let style = doc.createElement(tag);
            style.rel = 'stylesheet';
            style.id = id;
            tag === 'style' ? style.innerHTML = css : style.href = css;
            doc.getElementsByTagName('head')[0].appendChild(style);
        },

        /** 等待指定毫秒数供页面异步更新。 */
        sleep(time) {
            return new Promise(resolve => setTimeout(resolve, time));
        },

        /** 读取脚本管理器主版本以选择兼容授权流程。 */
        getMajorVersion(version) {
            const [major] = (version || '').split('.');
            return /^\d+$/.test(major) ? major : null;
        },

        /** 从页面 DOM 查找关联的 React 组件实例。 */
        findReact(dom, traverseUp = 0) {
            const key = Object.keys(dom).find(key => {
                return key.startsWith("__reactFiber$")
                    || key.startsWith("__reactInternalInstance$");
            });
            const domFiber = dom[key];
            if (domFiber == null) return null;

            if (domFiber._currentElement) {
                let compFiber = domFiber._currentElement._owner;
                for (let i = 0; i < traverseUp; i++) {
                    compFiber = compFiber._currentElement._owner;
                }
                return compFiber._instance;
            }

            /** 向上查找最近的非原生 DOM React 组件节点。 */
            const GetCompFiber = fiber => {
                let parentFiber = fiber.return;
                while (typeof parentFiber.type == "string") {
                    parentFiber = parentFiber.return;
                }
                return parentFiber;
            };
            let compFiber = GetCompFiber(domFiber);
            for (let i = 0; i < traverseUp; i++) {
                compFiber = GetCompFiber(compFiber);
            }
            return compFiber.stateNode || compFiber;
        },

        /** 注册文件名与文件大小的悬停提示。 */
        createTip() {
            $('body').append('<div class="pl-tooltip"></div>');

            doc.on('mouseenter mouseleave', '.listener-tip', (e) => {
                if (e.type === 'mouseenter') {
                    let filename = e.currentTarget.innerText;
                    let size = e.currentTarget.dataset.size;
                    let tip = `${filename}<span style="margin-left: 10px;color: #f56c6c;">${size}</span>`;
                    $(e.currentTarget).css({opacity: '0.5'});
                    $('.pl-tooltip').html(tip).css({
                        'left': e.pageX + 10 + 'px',
                        'top': e.pageY - e.currentTarget.offsetTop > 14 ? e.pageY + 'px' : e.pageY + 20 + 'px'
                    }).show();
                } else {
                    $(e.currentTarget).css({opacity: '1'});
                    $('.pl-tooltip').hide(0);
                }
            });
        },

        /** 创建隐藏 iframe 供浏览器发起下载。 */
        createDownloadIframe() {
            let $div = $('<div style="padding:0;margin:0;display:block"></div>');
            let $iframe = $('<iframe src="javascript:;" id="downloadIframe" style="display:none"></iframe>');
            $div.append($iframe);
            $('body').append($div);
        },

        /** 轮询页面元素，支持异步工具栏挂载。 */
        listenElement(element, callback) {
            const checkInterval = 500; // 检查元素的间隔时间（毫秒）
            let wasElementFound = false; // 用于跟踪元素是否之前已经找到

            /** 检查目标元素，并继续等待页面后续更新。 */
            function checkElement() {
                if (document.querySelector(element)) {
                    wasElementFound = true;
                    callback();
                } else if (wasElementFound) {
                    wasElementFound = false; // 元素消失后重置标志
                }

                setTimeout(checkElement, checkInterval);
            }

            checkElement();
        },

        /** 注入使用固定主题色的下载助手样式。 */
        addPanLinkerStyle() {
            let css = `
            body::-webkit-scrollbar { display: none }
            ::-webkit-scrollbar { width: 6px; height: 10px }
            ::-webkit-scrollbar-track { border-radius: 0; background: none }
            ::-webkit-scrollbar-thumb { background-color: rgba(85,85,85,.4) }
            ::-webkit-scrollbar-thumb,::-webkit-scrollbar-thumb:hover { border-radius: 5px; -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,.2) }
            ::-webkit-scrollbar-thumb:hover { background-color: rgba(85,85,85,.3) }
            .swal2-popup { font-size: 16px !important; }
            .pl-popup { font-size: 12px !important; }
            .pl-popup a { color: ${color} !important; }
            .pl-header { padding: 0!important;align-items: flex-start!important; border-bottom: 1px solid #eee!important; margin: 0 0 10px!important; padding: 0 0 5px!important; }
            .pl-title { font-size: 16px!important; line-height: 1!important;white-space: nowrap!important; text-overflow: ellipsis!important;}
            .pl-content { padding: 0 !important; font-size: 12px!important; }
            .pl-main { max-height: 400px;overflow-y:scroll; }
            .pl-footer {font-size: 12px!important;justify-content: flex-start!important; margin: 10px 0 0!important; padding: 5px 0 0!important; color: #f56c6c!important; }
            .pl-item { display: flex; align-items: center; line-height: 22px; }
            .pl-item-name { flex: 0 0 150px; text-align: left;margin-right: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor:default; }
            .pl-item-link { flex: 1; overflow: hidden; text-align: left; white-space: nowrap; text-overflow: ellipsis;cursor:pointer }
            .pl-item-btn { background: ${color}; padding: 4px 5px; border-radius: 3px; line-height: 1; cursor: pointer; color: #fff; }
            .pl-item-tip { display: flex; justify-content: space-between;flex: 1; }
            .pl-back { width: 70px; background: #ddd; border-radius: 3px; cursor:pointer; margin:1px 0; }
            .pl-ext { display: inline-block; width: 44px; background: #999; color: #fff; height: 16px; line-height: 16px; font-size: 12px; border-radius: 3px;}
            .pl-retry {padding: 3px 10px; background: #cc3235; color: #fff; border-radius: 3px; cursor: pointer;}
            .pl-browserdownload { padding: 3px 10px; background: ${color}; color: #fff; border-radius: 3px; cursor: pointer;}
            .pl-item-progress { display:flex;flex: 1;align-items:center}
            .pl-progress { display: inline-block;vertical-align: middle;width: 100%; box-sizing: border-box;line-height: 1;position: relative;height:15px; flex: 1}
            .pl-progress-outer { height: 15px;border-radius: 100px;background-color: #ebeef5;overflow: hidden;position: relative;vertical-align: middle;}
            .pl-progress-inner{ position: absolute;left: 0;top: 0;background-color: #409eff;text-align: right;border-radius: 100px;line-height: 1;white-space: nowrap;transition: width .6s ease;}
            .pl-progress-inner-text { display: inline-block;vertical-align: middle;color: #d1d1d1;font-size: 12px;margin: 0 5px;height: 15px}
            .pl-progress-tip{ flex:1;text-align:right}
            .pl-progress-how{ flex: 0 0 90px; background: #ddd; border-radius: 3px; margin-left: 10px; cursor: pointer; text-align: center;}
            .pl-progress-stop{ flex: 0 0 50px; padding: 0 10px; background: #cc3235; color: #fff; border-radius: 3px; cursor: pointer;margin-left:10px;height:20px}
            .pl-progress-inner-text:after { display: inline-block;content: "";height: 100%;vertical-align: middle;}
            .pl-btn-primary { background: ${color}; border: 0; border-radius: 4px; color: #ffffff; cursor: pointer; font-size: 12px; outline: none; display:flex; align-items: center; justify-content: center; margin: 2px 0; padding: 6px 0;transition: 0.3s opacity; }
            .pl-btn-primary:hover { opacity: 0.9;transition: 0.3s opacity; }
            .pl-btn-info { background: #606266; }
            .pl-btn-danger { background: #cc3235; }
            .ali-button {display: inline-flex;align-items: center;justify-content: center;border: 0 solid transparent;border-radius: 5px;box-shadow: 0 0 0 0 transparent;width: fit-content;white-space: nowrap;flex-shrink: 0;font-size: 14px;line-height: 1.5;outline: 0;touch-action: manipulation;transition: background .3s ease,color .3s ease,border .3s ease,box-shadow .3s ease;color: #fff;background: rgb(99 125 255);margin-left: 20px;padding: 1px 12px;position: relative; cursor:pointer; height: 32px;}
            .ali-button:hover {background: rgb(122, 144, 255)}
            .tianyi-button {margin-right: 20px; padding: 4px 12px; border-radius: 4px; color: #fff; font-size: 12px; border: 1px solid #0073e3; background: #2b89ea; cursor: pointer; position: relative;}
            .tianyi-button:hover {border-color: #1874d3; background: #3699ff;}
            .yidong-button {float: left; position: relative; margin: 20px 24px 20px 0; width: 98px; height: 36px; background: #3181f9; border-radius: 2px; font-size: 14px; color: #fff; line-height: 39px; text-align: center; cursor: pointer;}
            .yidong-share-button {display: inline-block; position: relative; font-size: 14px; line-height: 36px; height: 36px; text-align: center; color: #fff; border: 1px solid #5a9afa; border-radius: 2px; padding: 0 24px; margin-left: 24px; background: #3181f9; cursor: pointer;}
            .yidong-button:hover {background: #2d76e5;}
            .xunlei-button {display: inline-flex;align-items: center;justify-content: center;border: 0 solid transparent;border-radius: 5px;box-shadow: 0 0 0 0 transparent;width: fit-content;white-space: nowrap;flex-shrink: 0;font-size: 14px;line-height: 1.5;outline: 0;touch-action: manipulation;transition: background .3s ease,color .3s ease,border .3s ease,box-shadow .3s ease;color: #fff;background: #3f85ff;margin-left: 12px;padding: 0px 12px;position: relative; cursor:pointer; height: 36px;}
            .xunlei-button:hover {background: #619bff}
            .quark-button {display: inline-flex; align-items: center; justify-content: center; border: 1px solid #ddd; border-radius: 8px; white-space: nowrap; flex-shrink: 0; font-size: 14px; line-height: 1.5; outline: 0; color: #333; background: #fff; margin-right: 10px; padding: 0px 14px; position: relative; cursor: pointer; height: 36px;}
            .quark-button:hover { background:#f6f6f6 }
            .pl-dropdown-menu {position: absolute;right: 0;top: 30px;padding: 5px 0;color: rgb(37, 38, 43);background: #fff;z-index: 999;width: 102px;border: 1px solid #ddd;border-radius: 10px; box-shadow: 0 0 1px 1px rgb(28 28 32 / 5%), 0 8px 24px rgb(28 28 32 / 12%);}
            .pl-dropdown-menu-item { height: 30px;display: flex;align-items: center;justify-content: center;cursor:pointer }
            .pl-dropdown-menu-item:hover { background-color: rgba(132,133,141,0.08);}
            .pl-button .pl-dropdown-menu { display: none; }
            .pl-button:hover .pl-dropdown-menu { display: block!important; }
             @keyframes easeOpacity { from { opacity: 1; } 50% { opacity: 0.35 } to { opacity: 1; } }
            .element-clicked { opacity: 0.5; }
            .pl-extra { margin-top: 10px;display:flex}
            .pl-extra button { flex: 1}
            .pointer { cursor:pointer }
            .pl-input { flex: 1; padding: 8px 10px; border: 1px solid #c2c2c2; border-radius: 5px; font-size: 14px }
            .pl-close:focus { outline: 0; box-shadow: none; }
            .tag-danger {color:#cc3235;margin: 0 5px;}
            .pl-tooltip { position: absolute; color: #ffffff; max-width: 600px; font-size: 12px; padding: 5px 10px; background: #333; border-radius: 5px; z-index: 110000; line-height: 1.3; display:none; word-break: break-all;}
             @keyframes load { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
            .swal2-container { z-index:100000!important; }
            body.swal2-height-auto { height: inherit!important; }
            .btn-operate .btn-main { display:flex; align-items:center; }
            `;
            this.addStyle('panlinker-style', 'style', css);
        },

    };

    /** 百度网盘个人盘、分享页和 OAuth 页面适配。 */
    let baidu = {

        /** 正在进行的 BDUSS 读取请求，避免初始化和点击下载时重复查询。 */
        bdussRequest: null,

        /** Cookie 读取失败的本地说明，不包含原始 Cookie 或接口异常内容。 */
        bdussReadError: '',

        /** 读取百度分享下载所需的提取凭证。 */
        _getExtra() {
            let seKey = decodeURIComponent(base.getCookie('BDCLND'));
            return '{' + '"sekey":"' + seKey + '"' + "}";
        },

        /** 提取当前百度分享链接的标识。 */
        _getSurl() {
            let reg = /(?<=s\/|surl=)([a-zA-Z0-9_-]+)/g;
            if (reg.test(location.href)) {
                return location.href.match(reg)[0];
            }
            return '';
        },

        /** 收集选中文件的百度文件 ID，跳过目录。 */
        _getFidList() {
            let fidlist = [];
            selectList.forEach(v => {
                if (+v.isdir === 1) return;
                fidlist.push(v.fs_id);
            });
            return '[' + fidlist + ']';
        },

        /** 终止下载请求并清理进度轮询。 */
        _resetData() {
            progress = {};
            $.each(request, (key) => {
                (request[key]).abort();
            });
            $.each(ins, (key) => {
                clearInterval(ins[key]);
            });
            idm = {};
            ins = {};
            request = {};
        },

        /** 通过脚本管理器读取并缓存百度下载 Cookie。 */
        setBDUSS() {
            if (this.bdussRequest) return this.bdussRequest;
            this.bdussRequest = new Promise((resolve) => {
                /** 防止回调、Promise 和超时重复处理同一次读取结果。 */
                let settled = false;
                /** 处理读取结果，只向界面提供固定的诊断文案。 */
                const finish = (cookies, error) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    if (error === 'timeout') {
                        this.bdussReadError = 'Cookie 读取超时，请刷新页面后重试。';
                    } else if (error === 'unavailable' || /not supported|not implemented/i.test(String(error || ''))) {
                        this.bdussReadError = '当前脚本管理器未提供可用的 Cookie 读取接口。';
                    } else if (error === 'call-failed') {
                        this.bdussReadError = 'Cookie 接口调用失败，请确认脚本已更新并重新加载网盘页面。';
                    } else if (error && /permission|denied|forbidden/i.test(String(error))) {
                        this.bdussReadError = 'Cookie 访问被拒绝，请检查油猴的 Cookie 权限与当前站点授权。';
                    } else if (error) {
                        this.bdussReadError = 'Cookie 读取失败，脚本管理器未能完成请求。';
                    } else {
                        const cookie = Array.isArray(cookies) && cookies.find(item => item.name === 'BDUSS' && item.value);
                        this.bdussReadError = cookie ? '' : '未找到 BDUSS。请确认当前百度网盘已登录，且油猴的 Cookie 访问设置为 All。';
                        if (cookie) {
                            try {
                                base.setStorage('baiduyunPlugin_BDUSS', {BDUSS: cookie.value});
                            } catch (e) {
                                this.bdussReadError = 'Cookie 已读取，但浏览器未允许保存本地下载凭证。';
                            }
                        }
                    }
                    resolve(this.getBDUSS());
                };
                /** 限制接口等待时间，避免 cURL 下载界面一直处于加载状态。 */
                const timer = setTimeout(() => finish([], 'timeout'), 5000);
                /** 限定为当前匹配的网盘页面，并兼容分区 Cookie 查询。 */
                const details = {url: location.href, name: 'BDUSS', partitionKey: {}};
                try {
                    let result;
                    if (typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function') {
                        result = GM_cookie.list(details, finish);
                    } else if (typeof GM_cookie === 'function') {
                        result = GM_cookie('list', details, finish);
                    } else {
                        finish([], 'unavailable');
                    }
                    if (result && typeof result.then === 'function') {
                        result.then(cookies => finish(cookies, null), error => finish([], error));
                    }
                } catch (e) {
                    finish([], 'call-failed');
                }
            }).finally(() => {
                this.bdussRequest = null;
            });
            return this.bdussRequest;
        },

        /** 读取本地缓存的百度下载 Cookie。 */
        getBDUSS() {
            try {
                return base.getStorage('baiduyunPlugin_BDUSS')?.BDUSS || '';
            } catch (e) {
                return '';
            }
        },

        /** 为开放平台返回的直链附加当前 OAuth token，避免重复或无效参数。 */
        getDownloadLink(link) {
            try {
                const rawLink = typeof link === 'string' ? link.trim() : '';
                const url = new URL(rawLink);
                if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
                const accessToken = base.getValue('baidu_access_token');
                if (typeof accessToken === 'string' && accessToken.trim() && accessToken !== 'undefined' && accessToken !== 'null') {
                    // 只替换 token，原样保留签名等其他参数的顺序与百分号编码。
                    const hashIndex = rawLink.indexOf('#');
                    const fragment = hashIndex < 0 ? '' : rawLink.slice(hashIndex);
                    const address = hashIndex < 0 ? rawLink : rawLink.slice(0, hashIndex);
                    const queryIndex = address.indexOf('?');
                    const pathname = queryIndex < 0 ? address : address.slice(0, queryIndex);
                    const query = queryIndex < 0 ? '' : address.slice(queryIndex + 1);
                    const params = (query ? query.split('&') : []).filter(param => {
                        try {
                            return decodeURIComponent(param.split('=')[0]) !== 'access_token';
                        } catch (e) {
                            return true;
                        }
                    });
                    params.push('access_token=' + encodeURIComponent(accessToken));
                    return pathname + '?' + params.join('&') + fragment;
                }
                return rawLink;
            } catch (e) {
                return '';
            }
        },

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            let accessToken;
            try {
                const url = new URL(link);
                if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
                accessToken = url.searchParams.get('access_token');
            } catch (e) {
                return '';
            }
            const hasOAuthToken = !!accessToken?.trim() && accessToken !== 'undefined' && accessToken !== 'null';
            const BDUSS = this.getBDUSS();
            if (!hasOAuthToken && !BDUSS) return '';
            filename = base.fixFilename(filename);
            // OAuth 直链使用 token 与 User-Agent 鉴权，不以读取 BDUSS 为前置条件。
            const cookieOption = hasOAuthToken ? '' : ` -b "BDUSS=${BDUSS}"`;
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}" -A "${ua}"${cookieOption}`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            /** 收集所点击文件行的链接、进度和提示组件。 */
            function _factory(e) {
                let target = $(e.target);
                let item = target.parents('.pl-item');
                let link = item.find('.pl-item-link');
                let progress = item.find('.pl-item-progress');
                let tip = item.find('.pl-item-tip');
                return {
                    item, link, progress, tip, target,
                };
            }

            /** 终止指定文件的上次下载请求并清理进度。 */
            function _reset(i) {
                ins[i] && clearInterval(ins[i]);
                request[i] && request[i].abort();
                progress[i] = 0;
                idm[i] = false;
            }

            doc.on('mouseenter mouseleave click', '.pl-button.g-dropdown-button', (e) => {
                if (e.type === 'mouseleave') {
                    $(e.currentTarget).removeClass('button-open');
                } else {
                    $(e.currentTarget).addClass('button-open');
                    $(e.currentTarget).find('.pl-dropdown-menu').show();
                }
            });
            doc.on('mouseleave', '.pl-button.g-dropdown-button .pl-dropdown-menu', (e) => {
                $(e.currentTarget).hide();
            });

            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                let o = _factory(e);
                let $width = o.item.find('.pl-progress-inner');
                let $text = o.item.find('.pl-progress-inner-text');
                let filename = o.link[0].dataset.filename;
                let index = o.link[0].dataset.index;
                _reset(index);
                base.get(o.link[0].dataset.link, {"User-Agent": pan.ua}, 'blob', {filename, index});
                ins[index] = setInterval(() => {
                    let prog = +progress[index] || 0;
                    let isIDM = idm[index] || false;
                    if (isIDM) {
                        o.tip.hide();
                        o.progress.hide();
                        o.link.text('已成功唤起IDM，请查看IDM下载框！').animate({opacity: '0.5'}, "slow").show();
                        clearInterval(ins[index]);
                        idm[index] = false;
                    } else {
                        o.link.hide();
                        o.tip.hide();
                        o.progress.show();
                        $width.css('width', prog + '%');
                        $text.text(prog + '%');
                        if (prog === 100) {
                            clearInterval(ins[index]);
                            progress[index] = 0;
                            o.item.find('.pl-progress-stop').hide();
                            o.item.find('.pl-progress-tip').html('下载完成，正在弹出浏览器下载框！');
                        }
                    }
                }, 500);
            });
            doc.on('click', '.listener-retry', async (e) => {
                let o = _factory(e);
                o.tip.hide();
                o.link.show();
            });
            doc.on('click', '.listener-how', async (e) => {
                let o = _factory(e);
                let index = o.link[0].dataset.index;
                if (request[index]) {
                    request[index].abort();
                    clearInterval(ins[index]);
                    o.progress.hide();
                    o.tip.show();
                }

            });
            doc.on('click', '.listener-stop', async (e) => {
                let o = _factory(e);
                let index = o.link[0].dataset.index;
                if (request[index]) {
                    request[index].abort();
                    clearInterval(ins[index]);
                    o.tip.hide();
                    o.progress.hide();
                    o.link.show(0);
                }
            });
            doc.on('click', '.listener-back', async (e) => {
                let o = _factory(e);
                o.tip.hide();
                o.link.show();
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
            document.documentElement.addEventListener('mouseup', (e) => {
                if (e.target.nodeName === 'A' && ~e.target.className.indexOf('pl-a')) {
                    e.stopPropagation();
                }
            }, true);
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="g-dropdown-button pointer pl-button"><div style="color:#fff;background: ${color};border-color:${color}" class="g-button g-button-blue"><span class="g-button-right"><em class="icon icon-download"></em><span class="text" style="width: 60px;">下载助手</span></span></div><div class="menu" style="width:auto;z-index:41;border-color:${color}"><div style="color:${color}" class="g-button-menu pl-button-mode" data-mode="api">API下载</div><div style="color:${color}" class="g-button-menu pl-button-mode" data-mode="curl">cURL下载</div></div></div>`);
            if (pt === 'home') $toolWrap = $(pan.btn.home);
            if (pt === 'main') {
                $toolWrap = $(pan.btn.main);
                $button = $(`<div class="pl-button" style="position: relative; display: inline-block; margin-right: 8px;"><button class="u-button u-button--primary u-button--small is-round is-has-icon" style="background: ${color};border-color: ${color};font-size: 14px; padding: 8px 16px; border: none;"><i class="u-icon u-icon-download"></i><span>下载助手</span></button><ul class="dropdown-list nd-common-float-menu pl-dropdown-menu"><li class="sub cursor-p pl-button-mode" data-mode="api">API下载</li><li class="sub cursor-p pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            }
            if (pt === 'share') $toolWrap = $(pan.btn.share);
            $toolWrap.prepend($button);
            this.setBDUSS();
            this.addPageListener();
        },

        /** 读取或获取当前网盘的下载鉴权凭证。 */
        async getToken() {
            /** 打开授权页面，让脚本管理器处理跨页面 token 回传。 */
            const openTab = () => {
                GM_openInTab(pan.pcs[3], {active: false, insert: true, setParent: true});
                base.deleteValue('baidu_access_token');
            };

            /** 在限定时间内等待授权页面写入 access token。 */
            const waitForToken = () => new Promise((resolve) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    const token = base.getValue('baidu_access_token');
                    if (token) {
                        clearInterval(interval);
                        resolve(token);
                    }
                    attempts++;
                    if (attempts > 60) {
                        clearInterval(interval);
                        resolve('');
                    }
                }, 1000);
            });

            if (manageHandler === 'Tampermonkey' && base.getMajorVersion(manageVersion) >= 5) {
                openTab();
                return waitForToken();
            }
            let res = await base.getFinalUrl(pan.pcs[3]);

            if (!res.includes('authorize') && !res.includes('access_token=')) {
                openTab();
                return waitForToken();
            }
            if (res.includes('authorize')) {
                let html = await base.get(pan.pcs[3], {}, 'text');
                let bdstoken = html.match(/name="bdstoken"\s+value="([^"]+)"/)?.[1];
                let client_id = html.match(/name="client_id"\s+value="([^"]+)"/)?.[1];
                let data = {
                    grant_permissions_arr: 'netdisk',
                    bdstoken: bdstoken,
                    client_id: client_id,
                    response_type: "token",
                    display: "page",
                    grant_permissions: "basic,netdisk"
                };
                await base.post(pan.pcs[3], base.stringify(data), {
                    'Content-Type': 'application/x-www-form-urlencoded',
                });
                let res2 = await base.getFinalUrl(pan.pcs[3]);
                let accessToken = res2.match(/access_token=([^&]+)/)?.[1];
                accessToken && base.setValue('baidu_access_token', accessToken);
                return accessToken;
            }
            let accessToken = res.match(/access_token=([^&]+)/)?.[1];
            accessToken && base.setValue('baidu_access_token', accessToken);
            return accessToken;
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink(maxRequestTime = 1) {
            selectList = this.getSelectedList();
            let fidList = this._getFidList(), url, res;

            if (pt === 'home' || pt === 'main') {
                if (selectList.length === 0) {
                    return message.error('提示：请先勾选要下载的文件！');
                }
                if (fidList.length === 2) {
                    return message.error('提示：请打开文件夹后勾选文件！');
                }
                fidList = encodeURIComponent(fidList);
                let accessToken = base.getValue('baidu_access_token') || await this.getToken();
                if (typeof accessToken !== 'string' || !accessToken.trim() || accessToken === 'undefined' || accessToken === 'null') {
                    this.showMainDialog(pan[mode][0], '<div class="pl-main">百度下载授权未完成或已失效，请重新授权后重试。</div>', 'API 和 cURL 下载均需要有效的百度 OAuth 授权。');
                    return;
                }
                url = `${pan.pcs[0]}&fsids=${fidList}&access_token=${accessToken}`;
                res = await base.get(url, {"User-Agent": pan.ua});
            }
            if (pt === 'share') {
                this.getShareData();
                if (!params.bdstoken) {
                    return message.error('提示：请先登录网盘！');
                }
                if (selectList.length === 0) {
                    return message.error('提示：请先勾选要下载的文件！');
                }
                if (fidList.length === 2) {
                    return message.error('提示：请打开文件夹后勾选文件！');
                }
                let dialog = await Swal.fire({
                    toast: true,
                    icon: 'info',
                    title: `提示：请将文件<span class="tag-danger">[保存到网盘]</span>👉前往<span class="tag-danger">[我的网盘]</span>中下载！`,
                    showConfirmButton: true,
                    confirmButtonText: '点击保存',
                    position: 'top',
                });
                if (dialog.isConfirmed) {
                    $('.tools-share-save-hb')[0].click();
                }
                return;
            }
            if (res.errno === 0) {
                let html = this.generateDom(res.list);
                this.showMainDialog(pan[mode][0], html, pan[mode][1]);
            } else if (res.errno === 112) {
                return message.error('提示：页面过期，请刷新重试！');
            } else if (res.errno === 9019) {
                maxRequestTime--;
                await this.getToken();
                if (maxRequestTime > 0) {
                    await this.getPCSLink(maxRequestTime);
                } else {
                    message.error('提示：获取下载链接失败！请刷新网页后重试！');
                }
            } else {
                base.deleteValue('baidu_access_token');
                message.error('提示：获取下载链接失败！请刷新网页后重试！');
            }
        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            base.sortByName(list);
            list.forEach((v, i) => {
                if (v.isdir === 1) return;
                let filename = v.server_filename || v.filename;
                let ext = base.getExtension(filename);
                let size = base.sizeFormat(v.size);
                let dlink = this.getDownloadLink(v.dlink);
                if (!dlink) {
                    content += '<div class="pl-item">文件下载地址无效，请重新获取链接。</div>';
                    return;
                }
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link pl-a listener-link-api" href="${dlink}" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                <div class="pl-item-tip" style="display: none"><span>若没有弹出IDM下载框，找到IDM <b>选项</b> -> <b>文件类型</b> -> <b>第一个框</b> 中添加后缀 <span class="pl-ext">${ext}</span></span> <span class="pl-back listener-back">返回</span></div>
                                <div class="pl-item-progress" style="display: none">
                                    <div class="pl-progress">
                                        <div class="pl-progress-outer"></div>
                                        <div class="pl-progress-inner" style="width:5%">
                                          <div class="pl-progress-inner-text">0%</div>
                                        </div>
                                    </div>
                                    <span class="pl-progress-stop listener-stop">取消下载</span>
                                    <span class="pl-progress-tip">未发现IDM，使用自带浏览器下载</span>
                                    <span class="pl-progress-how listener-how">如何唤起IDM？</span>
                                </div></div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, pan.ua);
                    if (!alink) {
                        content += `<div class="pl-item">缺少有效的下载授权，暂时不能生成 cURL 命令。${this.bdussReadError || '请重新授权百度网盘后重试。'}</div>`;
                        return;
                    }
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                            <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                            <a class="pl-item-link pl-a listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl' && curlCommands)
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                return require('system-core:context/context.js').instanceForSystem.list.getSelected();
            } catch (e) {
                return document.querySelector('.wp-s-core-pan').__vue__.selectedList;
            }
        },

        /** 生成百度分享页面请求使用的日志标识。 */
        getLogid() {
            let ut = require("system-core:context/context.js").instanceForSystem.tools.baseService;
            return ut.base64Encode(base.getCookie("BAIDUID"));
        },

        /** 读取百度分享页面的转存与鉴权参数。 */
        getShareData() {
            let res = locals.dump();
            params.shareType = 'secret';
            params.sign = '';
            params.timestamp = '';
            params.bdstoken = res.bdstoken.value;
            params.channel = 'chunlei';
            params.clienttype = 0;
            params.web = 1;
            params.app_id = 250528;
            params.encrypt = 0;
            params.product = 'share';
            params.logid = this.getLogid();
            params.primaryid = res.shareid.value;
            params.uk = res.share_uk.value;
            params.shareType === 'secret' && (params.extra = this._getExtra());
            params.surl = this._getSurl();
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/disk\/home/.test(path)) return 'home';
            if (/^\/disk\/main/.test(path)) return 'main';
            if (/^\/(s|share)\//.test(path)) return 'share';
            return '';
            return '';
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            }).then(() => {
                this._resetData();
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.baidu});
            this.addButton();
            base.createTip();
        },

        /** 处理百度 OAuth 授权页面并保存 access token。 */
        async initAuthorize() {
            let ins = setInterval(() => {
                if (/openapi.baidu.com\/oauth\/2.0\/authorize/.test(location.href)) {
                    let confirmButton = document.querySelector('#auth-allow');
                    if (confirmButton) {
                        confirmButton.click();
                        return;
                    }
                }
                if (/openapi.baidu.com\/oauth\/2.0\/login_success/.test(location.href)) {
                    if (location.href.includes('access_token')) {
                        let token = location.href.match(/access_token=(.*?)&/)[1];
                        base.setValue('baidu_access_token', token);
                        window.close()
                    }
                }
            }, 200)
        }
    };

    /** 阿里云盘/阿里盘个人盘及分享页面适配。 */
    let ali = {

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            filename = base.fixFilename(filename);
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}" -e "https://www.aliyundrive.com/"`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                let dataset = e.currentTarget.dataset;
                let href = dataset.link;
                // let url = await this.getRealLink(dataset.did, dataset.fid);
                // if (url) href = url;
                $('#downloadIframe').attr('src', href);
                // let d = document.createElement("a");
                // d.download = e.currentTarget.dataset.filename;
                // d.rel = "noopener";
                // d.href = href;
                // d.dispatchEvent(new MouseEvent("click"));
            });
            doc.on('click', '.listener-link-api-btn', async (e) => {
                base.setClipboard(e.target.dataset.filename);
                $(e.target).text('复制成功').animate({opacity: '0.5'}, "slow");
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
        },

        /** 获取阿里个人盘文件缺失的真实下载链接。 */
        async getRealLink(d, f) {
            let authorization = `${base.getStorage('token').token_type} ${base.getStorage('token').access_token}`;
            let res = await base.post(pan.pcs[1], {
                drive_id: d,
                file_id: f
            }, {
                authorization,
                "content-type": "application/json;charset=utf-8",
                "referer": "https://www.aliyundrive.com/",
                "x-canary": "client=windows,app=adrive,version=v6.0.0"
            });
            if (res.code === 'AccessTokenInvalid') {
                return message.error('提示：Token过期，请刷新网页后重试！');
            }
            if (res.url) {
                return res.url;
            }
            return '';
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="ali-button pl-button"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M853.333 938.667H170.667a85.333 85.333 0 0 1-85.334-85.334v-384A85.333 85.333 0 0 1 170.667 384H288a32 32 0 0 1 0 64H170.667a21.333 21.333 0 0 0-21.334 21.333v384a21.333 21.333 0 0 0 21.334 21.334h682.666a21.333 21.333 0 0 0 21.334-21.334v-384A21.333 21.333 0 0 0 853.333 448H736a32 32 0 0 1 0-64h117.333a85.333 85.333 0 0 1 85.334 85.333v384a85.333 85.333 0 0 1-85.334 85.334z" fill="#fff"/><path d="M715.03 543.552a32.81 32.81 0 0 0-46.251 0L554.005 657.813v-540.48a32 32 0 0 0-64 0v539.734L375.893 543.488a32.79 32.79 0 0 0-46.229 0 32.427 32.427 0 0 0 0 46.037l169.557 168.811a32.81 32.81 0 0 0 46.251 0l169.557-168.81a32.47 32.47 0 0 0 0-45.974z" fill="#FF9C00"/></svg><span>下载助手</span><ul class="pl-dropdown-menu"><li class="pl-dropdown-menu-item pl-button-mode" data-mode="api">API下载</li><li class="pl-dropdown-menu-item pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            if (pt === 'home') {
                base.listenElement(pan.btn.home, () => {
                    $toolWrap = $(pan.btn.home);
                    $('.pl-button').length === 0 && $toolWrap.append($button);
                })
            }
            if (pt === 'share') {
                $button.css({'margin-right': '10px'});
                base.listenElement(pan.btn.share, () => {
                    $toolWrap = $(pan.btn.share);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            base.createDownloadIframe();
            this.addPageListener();
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink() {
            let reactDomGrid = document.querySelector(pan.dom.grid);
            if (reactDomGrid) {
                let res = await Swal.fire({
                    title: '提示',
                    html: '<div style="display: flex;align-items: center;justify-content: center;">请先切换到 <b>列表视图</b>（<svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M132 928c-32.8 0-59.2-26.4-59.2-59.2s26.4-59.2 59.2-59.2h760c32.8 0 59.2 26.4 59.2 59.2S924.8 928 892 928H132zm0-356.8c-32.8 0-59.2-26.4-59.2-59.2s26.4-59.2 59.2-59.2h760c32.8 0 59.2 26.4 59.2 59.2s-26.4 59.2-59.2 59.2H132zm0-356c-32.8 0-59.2-26.4-59.2-59.2S99.2 96.8 132 96.8h760c32.8 0 59.2 26.4 59.2 59.2s-26.4 59.2-59.2 59.2H132z"/></svg>）后获取！</div>',
                    confirmButtonText: '点击切换'
                });
                if (res) {
                    document.querySelector(pan.dom.switch).click();
                    return message.success('切换成功，请重新获取下载链接！');
                }
                return false;
            }
            selectList = this.getSelectedList();
            if (selectList.length === 0) {
                return message.error('提示：请先勾选要下载的文件！');
            }
            if (this.isOnlyFolder()) {
                return message.error('提示：请打开文件夹后勾选文件！');
            }
            if (pt === 'share') {
                if (selectList.length > 20) {
                    return message.error('提示：单次最多可勾选 20 个文件！');
                }
                try {
                    let authorization = `${base.getStorage('token').token_type} ${base.getStorage('token').access_token}`;
                    let xShareToken = base.getStorage('shareToken').share_token;

                    for (let i = 0; i < selectList.length; i++) {
                        let res = await base.post(pan.pcs[0], {
                            expire_sec: 600,
                            file_id: selectList[i].fileId,
                            share_id: selectList[i].shareId
                        }, {
                            authorization,
                            "content-type": "application/json;charset=utf-8",
                            "x-share-token": xShareToken
                        });
                        if (res.download_url) {
                            selectList[i].downloadUrl = res.download_url;
                        }
                    }
                } catch (e) {
                    return message.error('提示：请先登录网盘！');
                }
            } else {
                if (selectList.length > 20) {
                    return message.error('提示：单次最多可勾选 20 个文件！');
                }
                let noUrlSelectList = selectList.filter(v => !Boolean(v.url))
                let queue = [];
                noUrlSelectList.forEach((item, index) => {
                    queue.push(this.getRealLink(item.driveId, item.fileId));
                });

                const res = await Promise.all(queue);
                res.forEach((val, index) => {
                    noUrlSelectList[index].url = val;
                });

            }
            let html = this.generateDom(selectList);
            this.showMainDialog(pan[mode][0], html, pan[mode][1]);
        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            list.forEach((v, i) => {
                if (v.type === 'folder') return;
                let filename = v.name;
                let fid = v.fileId;
                let did = v.driveId;
                let size = base.sizeFormat(v.size);
                let dlink = v.downloadUrl || v.url;
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-api" data-did="${did}" data-fid="${fid}" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                <div class="pl-item-btn listener-link-api-btn" data-filename="${filename}">复制文件名</div>
                                </div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, navigator.userAgent);
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl')
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                let selectedList = [];
                let reactDom = document.querySelector(pan.dom.list);
                let reactObj = base.findReact(reactDom, 1);
                let props = reactObj.pendingProps;
                if (props) {
                    let fileList = props.dataSource || [];
                    let selectedKeys = props.selectedKeys.split(',');
                    fileList.forEach((val) => {
                        if (selectedKeys.includes(val.fileId)) {
                            selectedList.push(val);
                        }
                    });
                }
                return selectedList;
            } catch (e) {
                return [];
            }
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/(drive)/.test(path)) return 'home';
            if (/^\/(s|share)\//.test(path)) return 'share';
            return '';
        },

        /** 判断选中项是否全部为目录。 */
        isOnlyFolder() {
            for (let i = 0; i < selectList.length; i++) {
                if (selectList[i].type === 'file') return false;
            }
            return true;
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.ali});
            this.addButton();
            base.createTip();
        }
    };

    /** 天翼云盘下载鉴权、文件列表及分享页面适配。 */
    let tianyi = {

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            filename = base.fixFilename(filename);
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}"`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                $('#downloadIframe').attr('src', e.currentTarget.dataset.link);
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="tianyi-button pl-button">下载助手<ul class="pl-dropdown-menu" style="top: 26px;"><li class="pl-dropdown-menu-item pl-button-mode" data-mode="api">API下载</li><li class="pl-dropdown-menu-item pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            if (pt === 'home') {
                base.listenElement(pan.btn.home, () => {
                    $toolWrap = $(pan.btn.home);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            if (pt === 'share') {
                base.listenElement(pan.btn.share, () => {
                    $toolWrap = $(pan.btn.share);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            base.createDownloadIframe();
            this.addPageListener();
        },

        /** 读取或获取当前网盘的下载鉴权凭证。 */
        async getToken() {
            let res = await base.getFinalUrl(pan.pcs[1], {});
            let accessToken = res.match(/accessToken=(\w+)/)?.[1];
            accessToken && base.setStorage('accessToken', accessToken);
            return accessToken;
        },

        /** 请求单个文件的下载地址并返回其列表索引。 */
        async getFileUrlByOnce(item, index, token) {
            try {
                if (item.downloadUrl) return {
                    index,
                    downloadUrl: item.downloadUrl
                };
                let time = Date.now(),
                    fileId = item.fileId,
                    o = "AccessToken=" + token + "&Timestamp=" + time + "&fileId=" + fileId,
                    url = pan.pcs[2] + '?fileId=' + fileId;
                if (item.shareId) {
                    o = "AccessToken=" + token + "&Timestamp=" + time + "&dt=1&fileId=" + fileId + "&shareId=" + item.shareId;
                    url += '&dt=1&shareId=' + item.shareId;
                }
                let sign = md5(o).toString();
                let res = await base.get(url, {
                    "accept": "application/json;charset=UTF-8",
                    "sign-type": 1,
                    "accesstoken": token,
                    "timestamp": time,
                    "signature": sign
                });
                if (res.res_code === 0) {
                    return {
                        index,
                        downloadUrl: res.fileDownloadUrl
                    };
                } else if (res.errorCode === 'InvalidSessionKey') {
                    return {
                        index,
                        downloadUrl: '提示：请先登录网盘！'
                    };
                } else if (res.res_code === 'ShareNotFoundFlatDir') {
                    return {
                        index,
                        downloadUrl: '提示：请先[转存]文件，👉前往[我的网盘]中下载！'
                    };
                } else {
                    return {
                        index,
                        downloadUrl: '获取下载地址失败，请刷新重试！'
                    };
                }
            } catch (e) {
                return {
                    index,
                    downloadUrl: '获取下载地址失败，请刷新重试！'
                };
            }
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink() {
            selectList = this.getSelectedList();
            if (selectList.length === 0) {
                return message.error('提示：请先勾选要下载的文件！');
            }
            if (this.isOnlyFolder()) {
                return message.error('提示：请打开文件夹后勾选文件！');
            }
            let token = base.getStorage('accessToken') || await this.getToken();
            if (!token) {
                return message.error('提示：请先登录网盘！');
            }
            let queue = [];
            selectList.forEach((item, index) => {
                queue.push(this.getFileUrlByOnce(item, index, token));
            });

            const res = await Promise.all(queue);
            res.forEach(val => {
                selectList[val.index].downloadUrl = val.downloadUrl;
            });

            let html = this.generateDom(selectList);
            this.showMainDialog(pan[mode][0], html, pan[mode][1]);
        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            list.forEach((v, i) => {
                if (v.isFolder) return;
                let filename = v.fileName;
                let size = base.sizeFormat(v.size);
                let dlink = v.downloadUrl;
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-api" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                </div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, navigator.userAgent);
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl')
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                return document.querySelector(".c-file-list").__vue__.selectedList;
            } catch (e) {
                return [document.querySelector(".info-detail").__vue__.fileDetail];
            }
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/web\/main/.test(path)) return 'home';
            if (/^\/web\/share/.test(path)) return 'share';
            return '';
        },

        /** 判断选中项是否全部为目录。 */
        isOnlyFolder() {
            for (let i = 0; i < selectList.length; i++) {
                if (!selectList[i].isFolder) return false;
            }
            return true;
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.tianyi});
            this.addButton();
            this.getToken();
            base.createTip();
        }
    };

    /** 迅雷云盘个人文件下载及分享转存页面适配。 */
    let xunlei = {

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            filename = base.fixFilename(filename);
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}"`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                $('#downloadIframe').attr('src', e.currentTarget.dataset.link);
            });
            doc.on('click', '.listener-link-api-btn', async (e) => {
                base.setClipboard(e.target.dataset.filename);
                $(e.target).text('复制成功').animate({opacity: '0.5'}, "slow");
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="xunlei-button pl-button"><i class="xlpfont xlp-download"></i><span style="font-size: 13px;margin-left: 6px;">下载助手</span><ul class="pl-dropdown-menu" style="top: 34px;"><li class="pl-dropdown-menu-item pl-button-mode" data-mode="api">API下载</li><li class="pl-dropdown-menu-item pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            if (pt === 'home') {
                base.listenElement(pan.btn.home, () => {
                    $toolWrap = $(pan.btn.home);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            if (pt === 'share') {
                $button.css({'margin-right': '10px'});
                base.listenElement(pan.btn.share, () => {
                    $toolWrap = $(pan.btn.share);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            base.createDownloadIframe();
            this.addPageListener();
        },

        /** 读取或获取当前网盘的下载鉴权凭证。 */
        getToken() {
            let credentials = {}, captcha = {};
            for (let i = 0; i < localStorage.length; i++) {
                if (/^credentials_/.test(localStorage.key(i))) {
                    credentials = base.getStorage(localStorage.key(i));
                    base.setStorage('');
                }
                if (/^captcha_[\w]{16}/.test(localStorage.key(i))) {
                    captcha = base.getStorage(localStorage.key(i));
                }
            }
            let deviceid = /(\w{32})/.exec(base.getStorage('deviceid').split(','))[0];
            let token = {
                credentials,
                captcha,
                deviceid
            };
            return token;
        },

        /** 请求单个文件的下载地址并返回其列表索引。 */
        async getFileUrlByOnce(item, index, token) {
            try {
                if (item.downloadUrl) return {
                    index,
                    downloadUrl: item.downloadUrl
                };
                let res = await base.get(pan.pcs[0] + item.id, {
                    'Authorization': `${token.credentials.token_type} ${token.credentials.access_token}`,
                    'content-type': "application/json",
                    'x-captcha-token': token.captcha.token,
                    'x-device-id': token.deviceid,
                });
                if (res.web_content_link) {
                    return {
                        index,
                        downloadUrl: res.web_content_link
                    };
                } else {
                    return {
                        index,
                        downloadUrl: '获取下载地址失败，请刷新重试！'
                    };
                }
            } catch (e) {
                return message.error('提示：请先登录网盘后刷新页面！');
            }
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink() {
            selectList = this.getSelectedList();
            if (selectList.length === 0) {
                return message.error('提示：请先勾选要下载的文件！');
            }
            if (this.isOnlyFolder()) {
                return message.error('提示：请打开文件夹后勾选文件！');
            }
            if (pt === 'home') {
                let queue = [];
                let token = this.getToken();
                selectList.forEach((item, index) => {
                    queue.push(this.getFileUrlByOnce(item, index, token));
                });
                const res = await Promise.all(queue);
                res.forEach(val => {
                    selectList[val.index].downloadUrl = val.downloadUrl;
                });
            } else {
                let dialog = await Swal.fire({
                    toast: true,
                    icon: 'info',
                    title: `提示：请将文件<span class="tag-danger">[保存到网盘]</span>👉前往<span class="tag-danger">[我的网盘]</span>中下载！`,
                    showConfirmButton: true,
                    confirmButtonText: '点击保存',
                    position: 'top',
                });
                if (dialog.isConfirmed) {
                    document.querySelector('.saveToCloud').click();
                    return;
                }
            }
            let html = this.generateDom(selectList);
            this.showMainDialog(pan[mode][0], html, pan[mode][1]);

        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            list.forEach((v, i) => {
                if (v.kind === 'drive#folder') return;
                let filename = v.name;
                let size = base.sizeFormat(+v.size);
                let dlink = v.downloadUrl;
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-api" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                <div class="pl-item-btn listener-link-api-btn" data-filename="${filename}">复制文件名</div>
                                </div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, navigator.userAgent);
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl')
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                let doms = document.querySelectorAll('.SourceListItem__item--XxpOC');
                let selectedList = [];
                for (let dom of doms) {
                    let domVue = dom.__vue__;
                    if (domVue.selected.includes(domVue.info.id)) {
                        selectedList.push(domVue.info);
                    }
                }
                return selectedList;
            } catch (e) {
                return [];
            }
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/$/.test(path)) return 'home';
            if (/^\/(s|share)\//.test(path)) return 'share';
            return '';
        },

        /** 判断选中项是否全部为目录。 */
        isOnlyFolder() {
            for (let i = 0; i < selectList.length; i++) {
                if (selectList[i].kind === 'drive#file') return false;
            }
            return true;
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.xunlei});
            this.addButton();
            base.createTip();
        }
    };

    /** 夸克网盘下载及单页路由入口适配。 */
    let quark = {

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            filename = base.fixFilename(filename);
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}" -b "${document.cookie}"`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            window.addEventListener('hashchange', async (e) => {
                let home = 'https://pan.quark.cn/list#/', all = 'https://pan.quark.cn/list#/list/all';
                if (e.oldURL === home && e.newURL === all) return;
                await base.sleep(150);
                if ($('.quark-button').length > 0) return;
                this.addButton();
            });
            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                $('#downloadIframe').attr('src', e.currentTarget.dataset.link);
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="quark-button pl-button"><svg width="22" height="22" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd" stroke="#555" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 2-2z"/><path d="M14 8h1.553c.85 0 1.16.093 1.47.267.311.174.556.43.722.756.166.326.255.65.255 1.54v4.873c0 .892-.089 1.215-.255 1.54-.166.327-.41.583-.722.757-.31.174-.62.267-1.47.267H6.447c-.85 0-1.16-.093-1.47-.267a1.778 1.778 0 01-.722-.756c-.166-.326-.255-.65-.255-1.54v-4.873c0-.892.089-1.215.255-1.54.166-.327.41-.583.722-.757.31-.174.62-.267 1.47-.267H11"/><path stroke-linecap="round" stroke-linejoin="round" d="M11 3v10"/></g></svg><b>下载助手</b><ul class="pl-dropdown-menu"><li class="pl-dropdown-menu-item pl-button-mode" data-mode="api">API下载</li><li class="pl-dropdown-menu-item pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            if (pt === 'home') {
                base.listenElement(pan.btn.home, () => {
                    $toolWrap = $(pan.btn.home);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                });
            }
            if (pt === 'share') {
                $button.css({'margin-right': '10px'});
                base.listenElement(pan.btn.share, () => {
                    $toolWrap = $(pan.btn.share);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                });
            }
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink() {
            selectList = this.getSelectedList();
            if (selectList.length === 0) {
                return message.error('提示：请先勾选要下载的文件！');
            }
            if (this.isOnlyFolder()) {
                return message.error('提示：请打开文件夹后勾选文件！');
            }
            let fids = [];
            selectList.forEach(val => {
                fids.push(val.fid);
            });
            if (pt === 'home') {
                let res = await base.post(pan.pcs[0], {
                    "fids": fids
                }, {"content-type": "application/json;charset=utf-8", "user-agent": pan.ua});
                if (res.code === 31001) {
                    return message.error('提示：请先登录网盘！');
                }
                if (res.code !== 0) {
                    return message.error('提示：获取链接失败！');
                }
                let html = this.generateDom(res.data);
                this.showMainDialog(pan[mode][0], html, pan[mode][1]);
            } else {
                let dialog = await Swal.fire({
                    toast: true,
                    icon: 'info',
                    title: `提示：请将文件<span class="tag-danger">[保存到网盘]</span>👉前往<span class="tag-danger">[我的网盘]</span>中下载！`,
                    showConfirmButton: true,
                    confirmButtonText: '点击保存',
                    position: 'top',
                });
                if (dialog.isConfirmed) {
                    document.querySelector('.file-info_r').click();
                    return;
                }
            }
        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            list.forEach((v, i) => {
                if (v.file === false) return;
                let filename = v.file_name;
                let fid = v.fid;
                let size = base.sizeFormat(v.size);
                let dlink = v.download_url;
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-api" data-fid="${fid}" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                </div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, navigator.userAgent);
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl')
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                let selectedList = [];
                let reactDom = document.getElementsByClassName('file-list')[0];
                let reactObj = base.findReact(reactDom);
                let props = reactObj.props;
                if (props) {
                    let fileList = props.list || [];
                    let selectedKeys = props.selectedRowKeys || [];
                    fileList.forEach((val) => {
                        if (selectedKeys.includes(val.fid)) {
                            selectedList.push(val);
                        }
                    });
                }
                return selectedList;
            } catch (e) {
                return [];
            }
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/(list)/.test(path)) return 'home';
            if (/^\/(s|share)\//.test(path)) return 'share';
            return '';
        },

        /** 判断选中项是否全部为目录。 */
        isOnlyFolder() {
            for (let i = 0; i < selectList.length; i++) {
                if (selectList[i].file) return false;
            }
            return true;
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.quark});
            this.addButton();
            this.addPageListener();
            base.createTip();
            base.createDownloadIframe();
        }
    };

    /** 移动云盘个人盘签名下载及分享页面适配。 */
    let yidong = {

        /** 生成当前系统的 cURL 续传命令，并携带网盘所需鉴权。 */
        convertLinkToCurl(link, filename, ua) {
            filename = base.fixFilename(filename);
            return encodeURIComponent(`${base.getCurlCommand()} -L -C - "${link}" -o "${filename}"`);
        },

        /** 注册保留的下载和命令复制事件。 */
        addPageListener() {
            doc.on('click', '.pl-button-mode', (e) => {
                mode = e.target.dataset.mode;
                Swal.showLoading();
                this.getPCSLink();
            });
            doc.on('click', '.listener-link-api', async (e) => {
                e.preventDefault();
                $('#downloadIframe').attr('src', e.currentTarget.dataset.link);
            });
            doc.on('click', '.listener-link-curl, .listener-copy-all', (e) => {
                e.preventDefault();
                base.setClipboard(decodeURIComponent(e.target.dataset.link));
                $(e.target).text('复制成功，快去粘贴吧！').animate({opacity: '0.5'}, "slow");
            });
        },

        /** 在支持的网盘页面插入 API/cURL 下载入口。 */
        addButton() {
            if (!pt) return;
            let $toolWrap;
            let $button = $(`<div class="yidong-button pl-button">下载助手<ul class="pl-dropdown-menu" style="top: 36px;"><li class="pl-dropdown-menu-item pl-button-mode" data-mode="api">API下载</li><li class="pl-dropdown-menu-item pl-button-mode" data-mode="curl">cURL下载</li></ul></div>`);
            if (pt === 'home') {
                base.listenElement(pan.btn.home, () => {
                    $toolWrap = $(pan.btn.home);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            if (pt === 'share') {
                $button.removeClass('yidong-button').addClass('yidong-share-button');
                base.listenElement(pan.btn.share, () => {
                    $toolWrap = $(pan.btn.share);
                    $('.pl-button').length === 0 && $toolWrap.prepend($button);
                })
            }
            base.createDownloadIframe();
            this.addPageListener();
        },

        /** 生成移动云盘签名使用的随机字符串。 */
        getRandomString(len) {
            len = len || 16;
            let $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
            let maxPos = $chars.length;
            let pwd = '';
            for (let i = 0; i < len; i++) {
                pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
            }
            return pwd;
        },

        /** 转换移动云盘签名所需的 UTF-8 字符串。 */
        utob(str) {
            const u = String.fromCharCode;
            return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g, (t) => {
                if (t.length < 2) {
                    let e = t.charCodeAt(0);
                    return e < 128 ? t : e < 2048 ? u(192 | e >>> 6) + u(128 | 63 & e) : u(224 | e >>> 12 & 15) + u(128 | e >>> 6 & 63) + u(128 | 63 & e);
                }
                e = 65536 + 1024 * (t.charCodeAt(0) - 55296) + (t.charCodeAt(1) - 56320);
                return u(240 | e >>> 18 & 7) + u(128 | e >>> 12 & 63) + u(128 | e >>> 6 & 63) + u(128 | 63 & e);
            });
        },

        /** 生成移动云盘请求签名。 */
        getSign(e, t, a, n) {
            let r = "",
                i = "";
            if (t) {
                let s = Object.assign({}, t);
                i = JSON.stringify(s),
                    i = i.replace(/\s*/g, ""),
                    i = encodeURIComponent(i);
                let c = i.split(""),
                    u = c.sort();
                i = u.join("");
            }
            let A = md5(base.e(this.utob(i)));
            let l = md5(a + ":" + n);
            return md5(A + l).toUpperCase();
        },

        /** 请求单个文件的下载地址并返回其列表索引。 */
        async getFileUrlByOnce(item, index) {
            try {
                if (item.downloadUrl) return {
                    index,
                    downloadUrl: item.downloadUrl
                };
                if (this.detectPage() === 'home') {
                    let body = {
                        "contentID": item.contentID,
                        "commonAccountInfo": {"account": item.owner, "accountType": 1},
                        "operation": "0",
                        "inline": "0",
                        "extInfo": {"isReturnCdnDownloadUrl": "1"}
                    };
                    let time = new Date(+new Date() + 8 * 3600 * 1000).toJSON().substr(0, 19).replace('T', ' ');
                    let key = this.getRandomString(16);
                    let sign = this.getSign(undefined, body, time, key);

                    let res = await base.post(pan.pcs[0], body, {
                        'authorization': base.getCookie('authorization'),
                        'x-huawei-channelSrc': '10000034',
                        'x-inner-ntwk': '2',
                        'mcloud-channel': '1000101',
                        'mcloud-client': '10701',
                        'mcloud-sign': time + "," + key + "," + sign,
                        'content-type': "application/json;charset=UTF-8",
                        'caller': 'web',
                        'CMS-DEVICE': 'default',
                        'x-DeviceInfo': '||9|7.12.0|chrome|118.0.0.0||windows 10||zh-CN|||',
                        'x-SvcType': '1',
                    });
                    if (res.success) {
                        return {
                            index,
                            downloadUrl: res.data.downloadURL
                        };
                    } else {
                        return {
                            index,
                            downloadUrl: '获取下载地址失败，请刷新重试！'
                        };
                    }
                }
                if (this.detectPage() === 'share') {
                    let vueDom = document.querySelector(".main_file_list").__vue__;

                    let res = await base.post(pan.pcs[1], `linkId=${vueDom.linkID}&contentIds=${item.path}&catalogIds=`, {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    });
                    if (res.code === 0) {
                        return {
                            index,
                            downloadUrl: res.data.redrUrl
                        };
                    } else {
                        return {
                            index,
                            downloadUrl: '获取下载地址失败，请刷新重试！'
                        };
                    }
                }
            } catch (e) {
                return {
                    index,
                    downloadUrl: '获取下载地址失败，请刷新重试！'
                };
            }
        },

        /** 获取所选文件的下载链接并展示当前下载模式。 */
        async getPCSLink() {
            selectList = this.getSelectedList();
            if (selectList.length === 0) {
                return message.error('提示：请先勾选要下载的文件！');
            }
            if (this.isOnlyFolder()) {
                return message.error('提示：请打开文件夹后勾选文件！');
            }

            let queue = [];
            selectList.forEach((item, index) => {
                queue.push(this.getFileUrlByOnce(item, index));
            });

            const res = await Promise.all(queue);
            res.forEach(val => {
                selectList[val.index].downloadUrl = val.downloadUrl;
            });

            let html = this.generateDom(selectList);
            this.showMainDialog(pan[mode][0], html, pan[mode][1]);
        },

        /** 生成 API 下载列表或可复制的 cURL 命令列表。 */
        generateDom(list) {
            let content = '<div class="pl-main">';
            let curlCommands = '';
            list.forEach((v, i) => {
                if (v.dirEtag || v.caName) return;
                let filename = v.contentName || v.coName;
                let size = base.sizeFormat(v.contentSize || v.coSize);
                let dlink = v.downloadUrl;
                if (mode === 'api') {
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-api" data-filename="${filename}" data-link="${dlink}" data-index="${i}">${dlink}</a>
                                </div>`;
                }
                if (mode === 'curl') {
                    let alink = this.convertLinkToCurl(dlink, filename, navigator.userAgent);
                    curlCommands += alink + '\r\n';
                    content += `<div class="pl-item">
                                <div class="pl-item-name listener-tip" data-size="${size}">${filename}</div>
                                <a class="pl-item-link listener-link-curl" href="${alink}" title="点击复制curl链接" data-filename="${filename}" data-link="${alink}">${decodeURIComponent(alink)}</a> </div>`;
                }
            });
            content += '</div>';
            if (mode === 'curl')
                content += `<div class="pl-extra"><button class="pl-btn-primary listener-copy-all" data-link="${curlCommands}">复制全部命令</button></div>`;
            return content;
        },

        /** 从网盘页面内部状态读取选中文件。 */
        getSelectedList() {
            try {
                return document.querySelector(".main_file_list").__vue__.selectList.map(val => val.item);
            } catch (e) {
                let vueDom = document.querySelector(".home-page").__vue__;
                let fileList = vueDom._computedWatchers.fileList.value;
                let dirList = vueDom._computedWatchers.dirList.value;
                let selectedFileIndex = vueDom.selectedFile;
                let selectedDirIndex = vueDom.selectedDir;
                let selectFileList = fileList.filter((v, i) => {
                    return selectedFileIndex.includes(i);
                });
                let selectDirList = dirList.filter((v, i) => {
                    return selectedDirIndex.includes(i);
                });
                return [...selectFileList, ...selectDirList];
            }
        },

        /** 识别个人网盘页或分享页。 */
        detectPage() {
            let path = location.pathname;
            if (/^\/w/.test(path)) return 'home';
            if (/^\/link|shareweb/.test(path)) return 'share';
            return '';
        },

        /** 判断选中项是否全部为目录。 */
        isOnlyFolder() {
            for (let i = 0; i < selectList.length; i++) {
                if (selectList[i].fileEtag || selectList[i].coName) return false;
            }
            return true;
        },

        /** 显示下载结果弹窗。 */
        showMainDialog(title, html, footer) {
            Swal.fire({
                title,
                html,
                footer,
                allowOutsideClick: false,
                showCloseButton: true,
                showConfirmButton: false,
                position: 'top',
                width,
                padding: '15px 20px 5px',
                customClass,
            });
        },

        /** 加载内嵌网盘配置并直接初始化下载入口。 */
        async initPanLinker() {
            base.addPanLinkerStyle();
            pt = this.detectPage();
            pan = Object.freeze({...downloadDialogs, ...panConfigs.yidong});
            this.addButton();
            base.createTip();
        }
    };

    /** 按当前网页域名选择网盘适配模块。 */
    let main = {
        /** 根据域名分发到对应网盘适配模块。 */
        init() {
            if (/(pan|yun).baidu.com/.test(location.host)) {
                baidu.initPanLinker();
            }
            if (/openapi.baidu.com\/oauth/.test(location.href)) {
                baidu.initAuthorize()
            }
            if (/www.(aliyundrive|alipan).com/.test(location.host)) {
                ali.initPanLinker();
            }
            if (/cloud.189.cn/.test(location.host)) {
                tianyi.initPanLinker();
            }
            if (/pan.xunlei.com/.test(location.host)) {
                xunlei.initPanLinker();
            }
            if (/pan.quark.cn/.test(location.host)) {
                quark.initPanLinker();
            }
            if (/(yun|caiyun).139.com/.test(location.host)) {
                yidong.initPanLinker();
            }
        }
    };

    main.init();
})();
