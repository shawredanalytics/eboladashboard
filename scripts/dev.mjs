import { spawn } from 'node:child_process'

const children = []

function run(command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...env,
    },
  })

  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code)
    }
  })

  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(code)
}

run('node', ['server/index.mjs', '--dev'], {
  NODE_ENV: 'development',
  PORT: '8787',
})

run('npx', ['vite'], {
  NODE_ENV: 'development',
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
