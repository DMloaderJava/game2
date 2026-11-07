/**
 * AudioService — обёртка над Howler.js (Web Audio API).
 * Позиционное аудио, музыка, эфекты.
 */
export class AudioService {
  /** Воспроизвести звуковой эффект. */
  playSound(id: string, volume = 1, position?: { x: number; y: number }): void {
    // new Howl({ src: [...], volume }).play()
  }

  /** Запустить фоновую музыку с плавным затуханием. */
  playMusic(id: string, loop = true): void {}

  /** Остановить музыку. */
  stopMusic(fadeOut = 0.5): void {}

  /** Громкость эффектов / музыки (из настроек пользователя). */
  setVolume(kind: 'sfx' | 'music', value: number): void {}
}
