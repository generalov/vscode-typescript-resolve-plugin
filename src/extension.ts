import * as path from 'path'
import * as vscode from 'vscode'

const pluginId = 'typescript-resolve-plugin'
const configurationSection = 'tsresolve'
const commandNames = {
  followModule: 'tsresolve.followModule'
}

interface SynchronizedConfiguration {
  resolver?: string
  cwd?: string
  options?: object
}

function absPath(fileName: string, base: string) {
  return path.isAbsolute(fileName) ? fileName : path.join(base, fileName)
}

function extract(lineText: string): string | null {
  const ms = lineText.match(/(['"])(.*?)\1/)
  return ms && ms[2]
}

function followModule() {
  const config = getConfiguration()
  if (!config.resolver) {
    return
  }
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const document = editor.document
  const containingFile = document.fileName
  // let newApiRoot = vscode.workspace.getWorkspaceFolder(doc.uri);
  const sourcePath = /* newApiRoot && newApiRoot.uri.fsPath || */ vscode.workspace.rootPath
  if (!sourcePath) {
    return
  }
  const lineText = document.lineAt(editor.selection.active).text
  const moduleName = extract(lineText)

  if (moduleName) {
    const createResolver = require(absPath(config.resolver, sourcePath))
    const resolved = createResolver(config).resolve(moduleName, containingFile)
    const target = vscode.Uri.file(absPath(resolved, sourcePath))
    return vscode.commands.executeCommand('vscode.open', target)
  }
}

function getConfiguration(): SynchronizedConfiguration {
  const config = vscode.workspace.getConfiguration(configurationSection)
  const outConfig: SynchronizedConfiguration = {}

  withConfigValue(config, outConfig, 'resolver')
  withConfigValue(config, outConfig, 'cwd')
  withConfigValue(config, outConfig, 'options')

  return outConfig
}

function withConfigValue<C, K extends Extract<keyof C, string>>(
  config: vscode.WorkspaceConfiguration,
  outConfig: C,
  key: K
): void {
  const configSetting = config.inspect<C[K]>(key)
  if (!configSetting) {
    return
  }

  // Make sure the user has actually set the value.
  // VS Code will return the default values instead of `undefined`, even if user has not don't set anything.
  if (
    typeof configSetting.globalValue === 'undefined' &&
    typeof configSetting.workspaceFolderValue === 'undefined' &&
    typeof configSetting.workspaceValue === 'undefined'
  ) {
    return
  }

  const value = config.get<vscode.WorkspaceConfiguration[K] | undefined>(key, undefined)
  if (typeof value !== 'undefined') {
    outConfig[key] = <any>value
  }
}

async function getLanguageServerAPI() {
  // Get the TS extension
  const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features')
  if (!tsExtension) {
    return
  }

  await tsExtension.activate()

  // Get the API from the TS extension
  if (!tsExtension.exports || !tsExtension.exports.getAPI) {
    return
  }

  const api = tsExtension.exports.getAPI(0)

  return api
}

function synchronizeConfiguration(api: any) {
  const configuration = getConfiguration()
  api.configurePlugin(pluginId, configuration)
}

export async function activate(context: vscode.ExtensionContext) {
  const followEvent = vscode.commands.registerCommand(commandNames.followModule, followModule)
  context.subscriptions.push(followEvent)

  const api = await getLanguageServerAPI()
  if (!api) {
    return
  }
  const disposable = vscode.workspace.onDidChangeConfiguration(() => {
    synchronizeConfiguration(api)
  })
  context.subscriptions.push(disposable)
  synchronizeConfiguration(api)
}

export function deactivate() {}
