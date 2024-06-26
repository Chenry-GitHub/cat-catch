// url 参数解析
const params = new URL(location.href).searchParams;
const _url = params.get("url");
// const _referer = params.get("referer");
const _initiator = params.get("initiator");
const _requestHeaders = params.get("requestHeaders");
const _fileName = params.get("filename");
const autosend = params.get("autosend");
const autoClose = params.get("autoClose");
const title = params.get("title");
// const fileFlag = params.get("fileFlag");

// 修改当前标签下的所有xhr的Referer
let requestHeaders = JSONparse(_requestHeaders);
if (!requestHeaders.referer) {
    requestHeaders.referer = _initiator;
}
setRequestHeaders(requestHeaders, () => { awaitG(start); });

function start() {
    $("#autoClose").prop("checked", autoClose ? true : G.downAutoClose);
    $("#downActive").prop("checked", G.downActive);
    $(`<style>${G.css}</style>`).appendTo("head");

    chrome.tabs.getCurrent(function (tab) {
        startDownload(tab.id);
    });
}

function startDownload(tabId) {
    // 储存blob
    let blobUrl = "";
    // 下载的文件ID
    let downId = 0;
    // 没有url 打开输入框
    if (!_url) {
        $("#getURL").show();
        $("#getURL_btn").click(function () {
            const url = $("#getURL #url").val().trim();
            const referer = $("#getURL #referer").val().trim();
            window.location.href = `?url=${encodeURIComponent(url)}&requestHeaders=${encodeURIComponent(JSON.stringify({ referer: referer }))}`;
        });
        return;
    }

    const $downFilepProgress = $("#downFilepProgress");
    const $progress = $(".progress");

    // 使用ajax下载文件
    $("#downfile").show();
    // $downFilepProgress.html("后台下载中...");
    let fileTotal = 0;
    let progress = undefined;
    let timer = setInterval(() => {
        document.title = progress;
        if (progress == "100%" || progress == Infinity) {
            clearInterval(timer);
            return;
        }
    }, 500);

    $.ajax({
        url: _url,
        cache: false,
        xhrFields: { responseType: "blob" },
        xhr: function () {
            let xhr = new XMLHttpRequest();
            xhr.addEventListener("progress", function (evt) {
                progress = Math.round(evt.loaded / evt.total * 10000) / 100.00;
                if (progress != Infinity) {
                    fileTotal = fileTotal ? fileTotal : byteToSize(evt.total);
                    progress = progress + "%";
                    $downFilepProgress.html(byteToSize(evt.loaded) + " / " + fileTotal + " " + progress);
                    $progress.css("width", progress);
                } else {
                    $downFilepProgress.html(i18n.unknownSize);
                    $progress.css("width", "100%");
                }
            });

            // 某些网站需要传输 range
            let getStatusTimer = setInterval(() => {
                if (xhr.readyState != 4) { return; }
                clearInterval(getStatusTimer);
                if (xhr.status != 200 && !requestHeaders.range) {
                    requestHeaders.range = "bytes=0-";
                    params.delete("requestHeaders");
                    params.append("requestHeaders", JSON.stringify(requestHeaders));
                    const href = window.location.origin + window.location.pathname + "?" + params.toString();
                    window.location.href = href;
                }
            }, 100);

            return xhr;
        }
    }).fail(function (result) {
        document.title = i18n.downloadFailed;
        $downFilepProgress.html(i18n.downloadFailed + JSON.stringify(result));
    }).done(function (result) {
        try {
            blobUrl = URL.createObjectURL(result);
            $("#ffmpeg").show();
            // 自动发送到ffmpeg
            if (autosend) {
                sendFile("popupAddMedia");
                return;
            }
            $downFilepProgress.html(i18n.saving);
            document.title = i18n.saving;
            chrome.downloads.download({
                url: blobUrl,
                filename: stringModify(_fileName),
                saveAs: G.saveAs
            }, function (downloadId) {
                downId = downloadId;
            });
        } catch (e) {
            $downFilepProgress.html(i18n.saveFailed + e);
        }
    });

    // 监听下载事件 修改提示
    chrome.downloads.onChanged.addListener(function (downloadDelta) {
        if (!downloadDelta.state) { return; }
        if (downloadDelta.state.current == "complete" && downId != 0) {
            document.title = i18n.downloadComplete;
            $downFilepProgress.html(i18n.savePrompt);
            if ($("#autoClose").prop("checked")) {
                setTimeout(() => {
                    window.close();
                }, Math.ceil(Math.random() * 999));
            }
        }
    });

    // 返回上一页
    $("#historyBack").click(function () {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = "/download.html";
    });

    // 打开目录
    $(".openDir").click(function () {
        if (downId) {
            chrome.downloads.show(downId);
            return;
        }
        chrome.downloads.showDefaultFolder();
    });

    // 下载完成关闭本页面
    $("#autoClose").click(function () {
        chrome.storage.sync.set({
            downAutoClose: $("#autoClose").prop("checked")
        });
    });

    // 不跳转到下载器页面
    $("#downActive").click(function () {
        chrome.storage.sync.set({
            downActive: $("#downActive").prop("checked")
        });
    });

    // 发送到在线ffmpeg
    $("#ffmpeg").click(function () {
        sendFile();
    });
    function sendFile(action = "addMedia") {
        chrome.tabs.query({ url: ffmpeg.url }, function (tabs) {
            if (tabs.length && tabs[0].status != "complete") {
                setTimeout(() => { sendFile(action); }, 500);
            }
            chrome.runtime.sendMessage({
                Message: "catCatchFFmpeg",
                action: action,
                media: [{ data: blobUrl, name: getUrlFileName(_url) }],
                title: title,
                tabId: tabId
            });
        });
    }
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || Message.Message != "catCatchFFmpegResult" || Message.state != "ok" || tabId == 0 || Message.tabId != tabId) { return; }
        $downFilepProgress.html(i18n.sendFfmpeg);
        if (Message.state == "ok" && $("#autoClose").prop("checked")) {
            setTimeout(() => {
                window.close();
            }, Math.ceil(Math.random() * 999));
        }
    });
}