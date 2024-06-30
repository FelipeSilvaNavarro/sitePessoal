function corpo() {
  const form = document.querySelector('.form')
  const resultado = document.querySelector('.resultado')
  const arrayResultado = []

  /**
   * Recebe o submit do form, trata os dados e devolve
   * 
   */
  function recebeEventoForm(evento) {
    evento.preventDefault() // Prevenindo de a pagina atualizar

    /* Pega os dados inseridos e coloca um ponto no lugar da ,*/
    const peso = parseFloat(form.querySelector('#peso').value.replace(',', '.'))
    const altura = parseFloat(form.querySelector('#altura').value.replace(',', '.'))

    const pessoa = {
      peso,
      altura
    }

    arrayResultado.push(pessoa)

    resultado.innerHTML = ''

    // Verificação dos dados, se são válidos
    if (!isNaN(pessoa.peso) && !isNaN(pessoa.altura)) {
      // Formula do IMC
      const imc = pessoa.peso / (pessoa.altura * pessoa.altura)
      let classificacao = ''
      // Verificação do RANGE do IMC
      if (imc < 18.5) {
        classificacao = 'Abaixo do peso'
      } else if (imc >= 18.5 && imc < 25) {
        classificacao = 'Peso normal'
      } else if (imc >= 25 && imc < 30) {
        classificacao = 'Sobrepeso'
      } else if (imc >= 30 && imc < 35) {
        classificacao = 'Obesidade grau 1'
      } else if (imc >= 35 && imc < 40) {
        classificacao = 'Obesidade grau 2'
      } else {
        classificacao = 'Obesidade grau 3'
      }

      resultado.innerHTML = `<p>O seu IMC é: ${imc.toFixed(2)} - ${classificacao}</p>`
    } else {
      resultado.innerHTML = '<p>Por favor, insira valores válidos.</p>'
    }
  }

  form.addEventListener('submit', recebeEventoForm)
}

corpo()
