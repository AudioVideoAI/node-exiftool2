"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const util_1 = require("util");
const pUnlink = util_1.promisify(fs_1.unlink);
/**
 * Tooling constants.
 */
const BIN_PATH = path_1.join(__dirname, "../vendor/Image-ExifTool-11.84/exiftool").replace('app.asar', 'app.asar.unpacked');
const DELIMITER = "\n}]\n";
/**
 * Exec interface for `exiftool`.
 */
class Exec extends stream_1.Writable {
    constructor(args, pending) {
        var _a, _b, _c, _d, _e;
        super();
        this.process = child_process_1.spawn(BIN_PATH, args);
        this.pending = pending;
        let stdout = "";
        let stderr = "";
        (_a = this.process.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (chunk) => {
            let offset;
            stdout += chunk.toString("utf8");
            while ((offset = stdout.indexOf(DELIMITER)) > -1) {
                const len = offset + DELIMITER.length;
                const data = stdout.substr(0, len);
                stdout = stdout.substr(len);
                try {
                    this.pending--;
                    this.emit("exif", JSON.parse(data));
                }
                catch (err) {
                    this.emit("error", err);
                }
            }
        });
        (_b = this.process.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (chunk) => {
            let offset;
            stderr += chunk.toString("utf8");
            while ((offset = stderr.indexOf("\n")) > -1) {
                const data = stderr.substr(0, offset);
                stderr = stderr.substr(offset + 1);
                if (data.length) {
                    this.pending--;
                    this.emit("error", new Error(data));
                }
            }
        });
        (_c = this.process.stdout) === null || _c === void 0 ? void 0 : _c.on("error", this.emit.bind(this, "error"));
        (_d = this.process.stderr) === null || _d === void 0 ? void 0 : _d.on("error", this.emit.bind(this, "error"));
        (_e = this.process.stdin) === null || _e === void 0 ? void 0 : _e.on("error", (error) => {
            const code = error.code;
            if (code !== "EPIPE" && code !== "ECONNRESET") {
                this.emit("error", error);
            }
        });
    }
    _write(chunk, encoding, cb) {
        if (!this.process.stdin || !this.process.stdin.writable)
            return cb();
        return this.process.stdin.write(chunk, encoding, err => {
            if (err && err.code === "EPIPE")
                return cb();
            return cb(err);
        });
    }
    _destroy() {
        return this.process.kill("SIGTERM");
    }
    _final() {
        var _a;
        return (_a = this.process.stdin) === null || _a === void 0 ? void 0 : _a.end();
    }
    command(...args) {
        for (const arg of args)
            this.write(`${arg}\n`);
    }
    close() {
        return this.command("-stay_open", "False");
    }
    execute(...args) {
        return this.command(...args, "-q", "-json", "-execute");
    }
    send(...args) {
        let remaining = this.pending;
        this.pending++; // Track pending emit.
        this.execute(...args); // Send args to `execute`.
        return new Promise((resolve, reject) => {
            const onexif = (exif) => {
                if (remaining-- > 0)
                    return;
                removeListeners();
                return resolve(exif);
            };
            const onerror = (err) => {
                if (remaining-- > 0)
                    return;
                removeListeners();
                return reject(err);
            };
            const removeListeners = () => {
                this.removeListener("exif", onexif);
                this.removeListener("error", onerror);
            };
            this.on("exif", onexif);
            this.on("error", onerror);
        });
    }
    read(readable, ...args) {
        const tmpFilename = path_1.join(os_1.tmpdir(), `exiftool2_${Math.random()
            .toString(36)
            .substr(2)}`);
        const dest = readable.pipe(fs_1.createWriteStream(tmpFilename));
        const cleanup = () => {
            dest.close(); // Close file stream before unlinking.
            return pUnlink(tmpFilename);
        };
        return this.send(tmpFilename, ...args).then(exif => cleanup().then(() => exif), err => cleanup().then(() => Promise.reject(err)));
    }
}
exports.Exec = Exec;
/**
 * Handle `-stay_open` arguments.
 */
function open() {
    return new Exec(["-stay_open", "True", "-@", "-"], 0);
}
exports.open = open;
/**
 * Execute a command, returning on data.
 */
function exec(...args) {
    return new Exec(["-q", "-json", ...args], 1);
}
exports.exec = exec;
//# sourceMappingURL=index.js.map