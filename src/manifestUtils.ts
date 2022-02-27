import { Manifest } from './manifest'
import { ManifestSchema } from './flatpak.types'
import { ManifestMap } from './manifestMap';
import * as JSONC from 'jsonc-parser'
import { Uri, workspace } from 'vscode';
import * as yaml from 'js-yaml'
import * as path from 'path'

/**
 * VSCode specification compliant glob pattern to look up for
 * possible Flatpak manifests.
 */
export const MANIFEST_PATH_GLOB_PATTERN = '**/*.{json,yaml,yml}'

/**
 * Finds possible manifests in workspace then deserialize them.
 * @returns List of Flatpak Manifest
 */
export async function findManifests(): Promise<ManifestMap> {
    const uris: Uri[] = await workspace.findFiles(
        MANIFEST_PATH_GLOB_PATTERN,
        '**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*',
        1000
    )
    const manifests = new ManifestMap()
    for (const uri of uris) {
        try {
            const manifest = await parseManifest(uri)
            if (manifest) {
                manifests.add(manifest)
            }
        } catch (err) {
            console.warn(`Failed to parse the manifest at ${uri.fsPath}`)
        }
    }
    return manifests
}

/**
 * Parses a manifest. It also considers the application ID before reading and parsing.
 * @param uri Path to the manifest
 * @returns A valid FlatpakManifest, otherwise null
 */
export async function parseManifest(uri: Uri): Promise<Manifest | null> {
    const applicationId = path.parse(uri.fsPath).name
    if (!isValidDbusName(applicationId)) {
        return null
    }

    const textDocument = await workspace.openTextDocument(uri)
    const data = textDocument.getText()

    let manifest = null
    switch (textDocument.languageId) {
        case 'json':
            manifest = JSON.parse(data) as ManifestSchema
            break
        case 'jsonc':
            manifest = JSONC.parse(data) as ManifestSchema
            break
        case 'yaml':
            manifest = yaml.load(data) as ManifestSchema
            break
        default:
            // This should not be triggered since only json,yaml,yml are passed in findFiles
            console.error(`Trying to parse a document with invalid language id: ${textDocument.languageId}`)
            break
    }

    if (manifest === null) {
        return null
    }

    if (isValidManifest(manifest)) {
        return new Manifest(
            uri,
            manifest,
        )
    }

    return null
}

/**
 * Check if a DBus name follows the
 * [DBus specification](https://dbus.freedesktop.org/doc/dbus-specification.html).
 * @param name the DBus name
 */
export function isValidDbusName(name: string): boolean {
    // The length must be > 0 but must also be <= 255
    if (name.length === 0 || name.length > 255) {
        return false
    }

    const elements = name.split('.')

    // Should have at least two elements; thus, it has at least one period
    if (elements.length < 2) {
        return false
    }

    const isEveryElementValid = elements.every((element) => {
        // Must not be empty; thus, not having two consecutive periods
        // This also covers that the name must not start or end with a period
        return element.length !== 0
            // Must also not have a number as first character
            && !isNumber(element.charAt(0))
            // Element characters must only contain a-z, A-Z, hyphens, or underscores
            && [...element].every((char) => isValidDbusNameCharacter(char))
    })

    if (!isEveryElementValid) {
        return false
    }

    return true
}

/**
 * Checks whether a character is a valid dbus name character
 * @param char The character to check
 * @returns whether if the character is a valid dbus name character
 */
function isValidDbusNameCharacter(char: string): boolean {
    return isNumber(char)
        || (char >= 'A' && char <= 'Z')
        || (char >= 'a' && char <= 'z')
        || (char === '_')
        || (char === '-')
}

/**
 * Checks whether a character can be parsed to a number from 0 to 9
 * @param char A character
 * @returns Whether the character can be parsed to a number
 */
function isNumber(char: string): boolean {
    return char >= '0' && char <= '9'
}

function isValidManifest(manifest: ManifestSchema): boolean {
    const hasId = (manifest.id || manifest['app-id']) !== undefined
    const hasModules = manifest.modules !== undefined
    return hasId && hasModules
}


/**
 * Check if version1 is newer or equal than version2
 * @param version1 a flatpak version, usually returned by flatpak --version
 * @param version2 a flatpak version, required by the manifest
 * @returns Whether version1 is newer or equal than version2
 */
export function versionCompare(version1: string, version2?: string): boolean {
    // Ideally, this should maybe be a more sophisticated check
    return version1 >= (version2 || '')
}