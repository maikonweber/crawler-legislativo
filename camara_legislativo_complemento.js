import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { error } from 'node:console';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Criar pasta de output se não existir
const outputDir = path.join(__dirname, 'complemento_legislativo')
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
// Sempre vai existir 

async function baixarArquivo(url, caminhoDestino) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro ao baixar: ${response.statusText}`);
    const buffer = await response.buffer();
    fs.writeFileSync(caminhoDestino, buffer);
    console.log(`Arquivo salvo em: ${caminhoDestino}`);
}

// Função para sanitizar nomes de arquivos e pastas
function sanitizeFileName(name) {
    return name.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '_');
}

// Extrair os links para os documentos
async function extrairDocumentosNormasLista(page) {
    console.log("Extraindo documentos...");
    return await page.evaluate(() => {
        const resultados = [];
        const itens = document.querySelectorAll('.normas-lista');

        // biome-ignore lint/complexity/noForEach: <explanation>
        itens.forEach(item => {
            const links = item.querySelectorAll('a');
            
            // Verifica se há links suficientes e se eles possuem href
            const linkDetalhado = links[0]?.href; // Optional chaining
            const linkPDF = links[2]?.href;

            if (linkDetalhado && linkPDF) { // Só adiciona se ambos existirem
                resultados.push({
                    titulo: links[0].textContent.trim(),
                    linkDetalhado: linkDetalhado,
                    linkPDF: linkPDF
                });
            }
        });

        return resultados;
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Processar cada página de documentos
async function processarPagina(page, paginaAtual) {
    console.log(`\nProcessando página ${paginaAtual}...`);

    const documentos = await extrairDocumentosNormasLista(page);

    console.log(`Foram encontrados ${documentos.length} documentos na página ${paginaAtual}:`);

    const documentosInfo = [];

    for (let i = 0; i < documentos.length; i++) {
        const doc = documentos[i];
        console.log(`\nProcessando documento ${i + 1} de ${documentos.length}:`);
        console.log('Título:', doc.titulo);
        console.log('Link detalhado:', doc.linkDetalhado);
        console.log('Link PDF:', doc.linkPDF);

        const docDir = path.join(outputDir, sanitizeFileName(doc.titulo));

        if (!fs.existsSync(docDir)) {
            fs.mkdirSync(docDir, { recursive: true });
        }

        // Abrir página detalhada e salvar PDF da página
        const novaPagina = await page.browser().newPage();
        await novaPagina.goto(doc.linkDetalhado, { waitUntil: 'networkidle2' });
        await novaPagina.waitForSelector('a[href*="?Export=Pdf"]', { visible: false, timeout: 1000 });
        
        // Extrair o link para exportar PDF
        const exportarPdfLink = await novaPagina.evaluate(() => {
            const link = document.querySelector('a[href*="?Export=Pdf"]');
            return link ? link.href : null;
        });

        console.log(exportarPdfLink)
        
       
     // Definir pdfPath somente se o link foi encontrado
        const pdfPath = path.join(docDir, `${sanitizeFileName(doc.titulo)}_pagina.pdf`);
        console.log(`🔗 Baixando PDF de: ${exportarPdfLink}`);
        await baixarArquivo(exportarPdfLink, pdfPath);

        const caminhoPDF = path.join(docDir, `${sanitizeFileName(doc.titulo)}_manuscrito1.pdf`);

        await baixarArquivo(doc.linkPDF, caminhoPDF)
      
        // Fechar a página
        await novaPagina.close();
        documentosInfo.push({
            titulo: doc.titulo,
            pasta: docDir,
            pdfLink: exportarPdfLink,
            manucristoLink: doc.linkDetalhado,
            pagina_pdf: pdfPath,
            pdf_direto: caminhoPDF,
            pagina: paginaAtual
        });

        console.log('----------------------------------------');
    }

    return documentosInfo;
}

async function main() {
    const apenasUmaPagina = process.argv.includes('--uma-pagina');
    let todosDocumentosInfo = [];
    const documentosInfoPath = path.join(outputDir, 'documentos_info.json');

    let paginaAtual = 1;

    // Verifica se o arquivo documentos_info.json existe e se contém dados
    if (fs.existsSync(documentosInfoPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(documentosInfoPath));
            if (data.length > 0) {
                // Pegando a última entrada
                todosDocumentosInfo = data
                const ultimaPagina = data[data.length - 1].pagina;
                paginaAtual = ultimaPagina; // Inicia da página seguinte
                console.log(`Retomando a partir da página ${paginaAtual}...`);
            }
        } catch (e) {
            console.error('Erro ao ler documentos_info.json:', e.message);
        }
    }


    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--start-maximized']
    });


  
    
    try {
        const page = await browser.newPage();
        let temProximaPagina = true;
       

        while (temProximaPagina) {
            const url = `https://legislacaodigital.com.br/RioClaro-SP?Pagina=${paginaAtual}&Pesquisa=Avancada&TipoId=0&Numero=&Ano=&Data=&NumeroFinal=&AnoFinal=&DataFinal=&SituacaoId=0&ClassificacaoId=0&EmentaAssunto=a&PaginaCount=20&NoTexto=false`;

            console.log(`\nAcessando página ${paginaAtual}...`);
            await page.goto(url);

            console.log(url)
            await page.waitForSelector('.float-left.col-md-9');
            
           
            const documentosInfo = await processarPagina(page, paginaAtual);
            todosDocumentosInfo.push(...documentosInfo);
                paginaAtual++;
                if (apenasUmaPagina) break;
                console.log(`\nPreparando para processar página ${paginaAtual}...`);
                
        }

        const csvPath = path.join(outputDir, 'documentos_info.csv');
        const stream = fs.createWriteStream(csvPath, { flags: 'w', encoding: 'utf-8' });
        
        // Salvar informações em um arquivo JSON
        const infoPath = path.join(outputDir, 'documentos_info.json');
        stream.write('Título,Pasta,PDF,Tipo do Arquivo,Caminho do Arquivo,Página\n');

        for (const doc of todosDocumentosInfo) {
            // Verificar se 'documentos' é um array e não é vazio
            if (Array.isArray(doc.documentos) && doc.documentos.length > 0) {
                for (const arq of doc.documentos) {
                    // biome-ignore lint/style/useTemplate: <explanation>
                    const linha = [
                        `"${doc.titulo.replace(/"/g, '""')}"`,
                        `"${doc.pasta}"`,
                        `"${doc.pdf}"`,
                        `"${arq.tipo}"`,
                        `"${arq.caminho}"`,
                        doc.pagina
                    ].join(',') + '\n';
                    stream.write(linha);
                }
            } else {
                // Caso o documento não tenha arquivos anexos, adicionar uma linha vazia
                // biome-ignore lint/style/useTemplate: <explanation>
                                const linha = [
                    `"${doc.titulo.replace(/"/g, '""')}"`,
                    `"${doc.pasta}"`,
                    `"${doc.pdf}"`,
                    '',
                    '',
                    doc.pagina
                ].join(',') + '\n';
                stream.write(linha);
            }
        }
        // Finalizar o stream
        stream.end(() => {
            console.log(`CSV salvo em: ${csvPath}`);
        });

        fs.writeFileSync(infoPath, JSON.stringify(todosDocumentosInfo, null, 2));
        console.log(`\nInformações salvas em: ${infoPath}`);
       

    } catch (error) {
     
      
        console.error('Ocorreu um erro:', error);

    } finally {
            
        try {
            const infoPath = path.join(outputDir, 'documentos_info.json');
            fs.writeFileSync(infoPath, JSON.stringify(todosDocumentosInfo, null, 2));
            console.log(`\nInformações salvas em: ${infoPath}`);
        } catch (e) {
            console.error('Erro ao salvar JSON final:', e.message);
        }

        await browser.close();
    }
}

main();
