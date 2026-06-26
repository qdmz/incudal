declare module '@novnc/novnc/lib/rfb.js' {
  class RFB {
    constructor(target: HTMLElement, url: string, options?: {
      wsProtocols?: string[]
      shared?: boolean
      credentials?: { password?: string; username?: string }
      repeaterID?: string
      wsURL?: string
    })
    disconnect(): void
    sendCredentials(credentials: { password?: string; username?: string }): void
    sendCtrlAltDel(): void
    focus(): void
    blur(): void
    machineShutdown(): void
    machineReboot(): void
    machineReset(): void
    clipboardPasteFrom(text: string): void
    getImageData(): void
    toDataURL(type?: string, quality?: number): string
    addEventListener(event: string, callback: (e: any) => void): void
    removeEventListener(event: string, callback: (e: any) => void): void
    scaleViewport: boolean
    resizeSession: boolean
    showDotCursor: boolean
    viewOnly: boolean
    focusOnClick: boolean
    clipViewport: boolean
    dragViewport: boolean
    scalingLevel: number
  }
  export default RFB
}