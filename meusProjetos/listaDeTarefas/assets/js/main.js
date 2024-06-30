/* TODO 
  - Ajustar problema na verificação de duplicidades | Esta retornando false após a segunda verificação
*/

// Variáveis de seleção que poderão ser usadas globalmente
const p = document.querySelector('p')
const btn = document.querySelector('.adicionar')
const input = document.querySelector('.campo')
const ul = document.querySelector('.tarefas')

/**
 * Cria dinamicamente um elemento 'li'.
 * @returns {HTMLElement} Um elemento 'li' criado dinamicamente.
 */
function criaLi() {
  let li = document.createElement('li')
  li.setAttribute('class', 'tarefa')
  return li
}

/**
 * Limpa o valor do campo de entrada e foca nele.
 */
function limpaCampo() {
  input.value = ''
  input.focus()
}

/**
 * Cria dinamicamente um elemento 'button'.
 * @returns {HTMLElement} Um elemento 'button' criado dinamicamente.
 */
function criaButton() {
  let button = document.createElement('button')
  return button
}

/**
 * Cria um botão 'Apagar' dentro de um elemento 'li'.
 * @param {HTMLElement} li - O elemento 'li' pai ao qual o botão será adicionado como filho de cada lista.
 * @returns {HTMLElement} O botão 'Apagar' criado com o X no meio em cada lista.
 */
function criaBotaoApagarTarefa(li) {
  let btn = criaButton()
  let txtBtn = document.createTextNode('X')
  btn.appendChild(txtBtn)
  li.appendChild(btn) // Adiciona o botão no final do elemento <li>
  btn.setAttribute('id', 'btnApagar')
  btn.setAttribute('class', 'btnApagar')
  return btn
}

/**
 * Cria um botão 'Apagar tudo' dentro de um elemento 'p' pai se ainda não existir botão apagar tudo.
 * @param {HTMLElement} p - O elemento 'p' pai ao qual o botão será adicionado como filho do paragrafo inteiro.
 * @returns {HTMLElement|String} O botão 'Apagar tudo' criado ou nada
 */
function criaBotaoApagarTodasTarefas(p) {
  if (!document.querySelector('#btnApagarTudo')) {
    let btnApagarTudo = criaButton()
    let txtBtn = document.createTextNode('Apagar tudo')
    btnApagarTudo.appendChild(txtBtn)
    p.appendChild(btnApagarTudo)
    btnApagarTudo.setAttribute('id', 'btnApagarTudo')
    btnApagarTudo.setAttribute('class', 'btnApagarTudo')
    return btnApagarTudo
  }
}

function verificaDuplicidade(inputTarefa) {
  // Seleciona todos os LI
  let tarefas = document.querySelectorAll('.tarefa')
  // Itera sobre cada LI
  for (let tarefa of tarefas) {
    // Verfica se a lista tem pelo menos uma tarefa para ignorar a primeira verificação
    if (tarefas.length > 1) {
      // Pega o texto da tarefa formatado
      let tarefaExistente = tarefa.textContent.replace('X', '').toLowerCase()
      let novaTarefa = inputTarefa.toLowerCase()
      if (novaTarefa === tarefaExistente) {
        console.log(novaTarefa + ' É igual a ' + tarefaExistente)
        return true
      } else {
        console.log(novaTarefa + ' É diferente da ' + tarefaExistente)
        return false
      }
    } else {
      console.log('Não é maior 1')
      return false
    }
  }
}

// Listeners dos botões | APAGA um LI e APAGA TODOS OS LI
document.addEventListener('click', function (e) {
  const element = e.target
  if (element.id === 'btnApagar') {
    element.parentElement.remove()
    atualizaJSON()
  }
  if (element.id === 'btnApagarTudo') {
    ul.innerHTML = ''
    atualizaJSON()
  }
})

/**
 * Atualiza os dados em formato JSON no localStorage com as tarefas da lista.
 */
// Essa função ta sendo chamada em cada vez que meche na lista, no caso ao excluir e inserir, para não ter divergencia de dados no localstorage
function atualizaJSON() {
  let liTarefas = ul.querySelectorAll('li')
  let arrayListaTarefas = []
  for (let tarefa of liTarefas) {
    let tarefaTexto = tarefa.innerText
    tarefaTexto = tarefaTexto.replace('X', '')
    arrayListaTarefas.push(tarefaTexto)
  }
  const tarefasJSON = JSON.stringify(arrayListaTarefas)
  localStorage.setItem('tarefas', tarefasJSON)
}

/**
 * Adiciona as tarefas salvas do localStorage a lista quando a página é carregada novamente.
 */
function adicionaTarefasSalva() {
  const tarefas = localStorage.getItem('tarefas')
  const listaTarefas = JSON.parse(tarefas)

  for (let tarefa of listaTarefas) {
    criaTarefa(tarefa)
  }
}

/**
 * Função principal para criar uma nova tarefa na lista.
 * @param {String} tarefa - O texto da nova tarefa a ser adicionada.
 */
function criaTarefa(tarefa) {
  const li = criaLi()
  li.textContent = tarefa
  ul.appendChild(li) // Adiciona a nova tarefa à lista de tarefas
  criaBotaoApagarTarefa(li) // Adiciona o botão 'Apagar' ao final da tarefa
  criaBotaoApagarTodasTarefas(p) // Adiciona o botão 'Apagar tudo' na lista de tarefas
  console.log(verificaDuplicidade(tarefa)) // Verifica se o texto da tarefa a ser inserido, ja existe na lista de tarefas
  limpaCampo()
  atualizaJSON()
}

// Evento de clique no botão 'Adicionar'
btn.addEventListener('click', function () {
  if (input.value === '') return
  criaTarefa(input.value)
})

// Evento ao pressionar ENTER no campo de entrada
input.addEventListener('keypress', function (e) {
  if (e.keyCode === 13) {
    if (input.value === '') return
    criaTarefa(input.value)
  }
})

// Chama a função para adicionar as tarefas salvas do localStorage ao carregar a página
adicionaTarefasSalva()
