import { Game } from './game.js'

const game = new Game()
window.__apexGame = game

game.init().catch(error => {
  console.error(error)
  const status = document.getElementById('loading-status')
  if (status) status.textContent = 'Failed to start the engine — check the console.'
  const fatal = document.getElementById('fatal')
  if (fatal) {
    fatal.classList.remove('hidden')
    fatal.querySelector('p').textContent = error?.message || 'Unable to initialise WebGL.'
  }
})
