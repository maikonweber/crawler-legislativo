# 📄 Scraper de Documentos Públicos - Câmara Municipal de Rio Claro/SP

Este projeto é um script automatizado em **Node.js com Puppeteer** que acessa o site da [Câmara Municipal de Rio Claro - SP](https://www.camararioclaro.sp.gov.br), extrai documentos legislativos públicos, baixa arquivos relacionados (PDF, DOC, etc.) e organiza tudo localmente com um arquivo JSON contendo metadados detalhados.

---

## 🚀 Funcionalidades

- 📄 Acessa automaticamente múltiplas páginas de listagem de documentos.
- 🔗 Extrai o título e link de cada item.
- 🧭 Acessa a página individual de cada documento.
- 🖨️ Salva a versão em PDF da página do documento.
- 📥 Baixa todos os arquivos associados (PDFs, DOCs) da tabela.
- 📁 Organiza os documentos em subpastas com nomes baseados nos títulos.
- 🧾 Gera o arquivo `documentos_info.json` com os metadados dos documentos baixados.

---

## 📦 Requisitos

- [Node.js (v16 ou superior)](https://nodejs.org/pt-br/download/)
- [NPM](https://www.npmjs.com/get-npm) (já incluído no instalador do Node.js)

---

## 💾 Instalação

1. Clone o repositório:

```bash
git clone https://github.com/seu-usuario/scraper-rioclaro.git
cd scraper-rioclaro

2. Install Depencencia:

npm install


3. Executar a extração:

npm run start:leg
OR
npm run start:pro
```

