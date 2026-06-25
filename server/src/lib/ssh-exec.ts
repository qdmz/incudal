import { Client } from 'ssh2'

interface SshExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export async function sshExec(
  host: string,
  port: number,
  username: string,
  password: string,
  command: string,
  timeoutMs: number = 15000
): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        conn.end()
        reject(new Error(`SSH exec timeout after ${timeoutMs}ms: ${command}`))
      }
    }, timeoutMs)

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          if (!settled) { settled = true; conn.end(); reject(err) }
          return
        }
        stream.on('data', (data: Buffer) => { stdout += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
        stream.on('close', (code: number | null) => {
          clearTimeout(timer)
          if (!settled) { settled = true; conn.end(); resolve({ stdout, stderr, exitCode: code }) }
        })
      })
    })

    conn.on('error', (err) => {
      clearTimeout(timer)
      if (!settled) { settled = true; reject(err) }
    })

    conn.connect({ host, port, username, password, readyTimeout: 10000 })
  })
}

export async function sshTestConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await sshExec(host, port, username, password, 'echo ok', 10000)
    return { success: result.exitCode === 0 }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}