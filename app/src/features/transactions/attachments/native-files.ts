/* eslint-disable @typescript-eslint/no-require-imports */
import { requireOptionalNativeModule } from "expo";
import type { LocalFile } from "@/data/api";
import { ACCEPTED_MIME_TYPES, mimeTypeOf, PHOTO_QUALITY, photoFileName, photoResize } from "@/domain/attachments";

type DocumentPickerPackage = typeof import("expo-document-picker");
type CameraPackage = typeof import("expo-camera");
type ImageManipulatorPackage = typeof import("expo-image-manipulator");

/**
 * Carrega o pacote só se o módulo nativo existir no app instalado. Carregar um pacote cujo
 * módulo nativo falta gera erro fatal no Metro, mesmo dentro de try/catch (mesmo cuidado da voz).
 */
function optional<T>(nativeName: string, load: () => T): T | null {
  return requireOptionalNativeModule(nativeName) ? load() : null;
}

/** Seletor de documentos do sistema (R25, R76). */
export function getDocumentPicker(): DocumentPickerPackage | null {
  return optional("ExpoDocumentPicker", () => require("expo-document-picker") as DocumentPickerPackage);
}

/** Câmera (R24). */
export function getCamera(): CameraPackage | null {
  return optional("ExpoCamera", () => require("expo-camera") as CameraPackage);
}

/** Redução da foto antes do envio (R86). */
export function getImageManipulator(): ImageManipulatorPackage | null {
  return optional("ExpoImageManipulator", () => require("expo-image-manipulator") as ImageManipulatorPackage);
}

/** Arquivo escolhido no aparelho, com o tamanho informado pelo sistema (para a validação local). */
export interface PickedFile extends LocalFile {
  size: number | null;
}

/**
 * Abre o seletor (PDF e imagens), com cópia para o cache do app para o envio ler o arquivo.
 * Devolve null se o usuário cancelar. O tipo é conferido depois, em `validateLocalFile`.
 */
export async function pickDocument(): Promise<PickedFile | null> {
  const picker = getDocumentPicker();
  if (!picker) throw new Error("O seletor de arquivos não está disponível neste aparelho.");
  const result = await picker.getDocumentAsync({
    type: [...ACCEPTED_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: mimeTypeOf(asset.name, asset.mimeType) ?? asset.mimeType ?? "application/octet-stream",
    size: typeof asset.size === "number" ? asset.size : null,
  };
}

/**
 * Reduz a foto para o lado maior de 1600 px e comprime em JPEG 0,7 (ADR-S2-012). Sem o módulo,
 * envia a original (o servidor recusa acima de 5 MB com mensagem própria).
 */
export async function shrinkPhoto(photo: { uri: string; width: number; height: number }): Promise<LocalFile> {
  const manipulator = getImageManipulator();
  const name = photoFileName();
  if (!manipulator) return { uri: photo.uri, name, mimeType: "image/jpeg" };
  const context = manipulator.ImageManipulator.manipulate(photo.uri);
  const size = photoResize(photo.width, photo.height);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: manipulator.SaveFormat.JPEG });
  return { uri: saved.uri, name, mimeType: "image/jpeg" };
}
