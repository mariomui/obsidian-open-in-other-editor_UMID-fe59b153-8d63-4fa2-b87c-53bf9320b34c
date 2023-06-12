import {
	DataAdapter,
	Plugin,
	Notice,
	App,
	Vault,
	MenuItem,
	Menu,
} from "obsidian";
import * as os from "os";
import { spawn } from "child_process";
import { OpenFilePlgSettingTab } from "./components/OpenFilePlgSettingTab";

type EditorName = "gvim" | "code";
type AdapterPlus = Partial<DataAdapter> & {
	path: any;
	basePath: any;
};

function runCMD(cmd: string) {
	const { exec } = require("child_process");
	exec(cmd, (error: string, stdout: string, stderr: string) => {
		if (error) {
			console.error(`run cmd err: ${error}, ${stdout}, ${stderr}`);
			return;
		}
		console.log(`run cmd: ${cmd}`);
	});
}

type HandleArguments = {
	file: string;
	args: string[];
};
export async function execa(file: string, args: string[]) {
	const handledArgs = handleArguments(file, args);
	let spawned = spawn(handledArgs.file, handledArgs.args);
	return new Promise((resolve, reject) => {
		spawned.on("exit", (exitCode, signal) => {
			resolve({ exitCode, signal });
		});

		spawned.on("error", (error) => {
			reject(error);
		});
		spawned.stdout.on("data", (data) => console.log(data.toString()));
		if (spawned.stdin) {
			spawned.stdin.on("error", (error) => {
				reject(error);
			});
		}
	});
}
function handleArguments(
	file: HandleArguments["file"],
	args: HandleArguments["args"]
) {
	return { file, args };
}
type SettingConfig = {
	vscode_path: string;
	gvim_path: string;
};
export default class OpenFilePlg extends Plugin {
	settingConfig: SettingConfig = {
		vscode_path: "",
		gvim_path: "",
	};

	async doLoadSettingConfig() {
		this.settingConfig = {
			...this.settingConfig,
			...(await this.loadData()),
		};
	}
	async doSaveSettingConfig() {
		await this.saveData(this.settingConfig);
	}

	async onload() {
		await this.doLoadSettingConfig();
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, abstractFile, source) => {
				menu.addSeparator();
				menu.addItem((mi) => {
					mi.setTitle("Open in other editor").onClick(
						clickHandler.bind(this)
					);
				});
				function clickHandler(e: MouseEvent) {
					if (this.settingConfig.vscode_path) {
						return this.open("code", {
							curFilePath: abstractFile.path,
						});
					}
					new Notice(
						"Please save vscode editor path in settings.",
						5000
					);
				}
				menu.addSeparator();
			})
		);
		this.registerEvent(
			this.app.workspace.on(
				"files-menu",
				(menu: Menu, abstractFile: any, source: any) => {
					menu.addSeparator()
						.addItem((mi: MenuItem) => {
							mi.setTitle("Open in other editor").onClick(
								clickHandler.bind(this)
							);
						})
						.addSeparator();
					function clickHandler(e: MouseEvent) {
						if (
							this.settingConfig.vscode_path &&
							Array.isArray(abstractFile)
						) {
							return abstractFile.forEach((af) => {
								this.open("code", {
									curFilePath: af.path,
								});
							});
						}
						this.open("code", {
							curFilePath: abstractFile.path,
						});
					}
				}
			)
		);
		this.addCommand({
			id: "open-in-other-editor-gvim",
			name: "Open current active file in gVim",
			callback: () => {
				this.open("gvim");
			},
		});

		this.addCommand({
			id: "open-in-other-editor-vscode",
			name: "Open current active file in VScode",
			callback: () => {
				this.open("code");
			},
		});
		this.addSettingTab(new OpenFilePlgSettingTab(app, this));
	}

	onunload() {}

	private open(
		by: EditorName,
		overrideConfig?: {
			curFilePath?: string;
		}
	) {
		const { curFilePath } = {
			curFilePath: this.app.workspace.getActiveFile()?.path,
			...overrideConfig,
		};
		if (!curFilePath) {
			return new Notice("no active file in workspace", 6000);
		}
		let cwd = this.app.vault.adapter.getResourcePath(".");
		const { adapter } = this.app.vault;
		const { basePath } = adapter as AdapterPlus;

		const platform: NodeJS.Platform = os.platform();
		if (["darwin"].includes(platform)) {
			const file = {
				code: this.settingConfig.vscode_path,
				gvim: this.settingConfig.gvim_path,
			};
			return this.macopen(basePath, curFilePath, file[by]);
		}
		cwd = cwd.replace("app://local/", "").replace(/\?\d+.*?/, "");
		if (os.type() === "Windows_NT") {
			runCMD(`cd /d ${cwd} && ${by} ./"${curFilePath}"`);
		} else {
			runCMD(`cd ${cwd} && ${by} ./"${curFilePath}"`);
		}
	}

	private macopen(basePath: string, curFilePath: string, by: string): void {
		const {
			path: { join },
		} = this.app.vault.adapter as AdapterPlus;
		const derived_path = join(basePath, curFilePath);
		void (async function (
			file: string,
			app: App & {
				vault: {
					adapter: DataAdapter & { fsPromises?: any };
				} & Vault;
			}
		) {
			if (!file) {
				return new Notice(
					"Please save absolute path to vscode into settings",
					7000
				);
			}

			const { err, access } = await app.vault.adapter.fsPromises
				.stat(file)
				.then((access: any) => ({ access, err: null }))
				.catch((err: Error) => {
					return {
						err,
						stat: null,
					};
				});
			if (err && !access) {
				return console.log({ err, access });
			}
			await execa(file, [derived_path]);
		})(by, this.app);
	}
}
