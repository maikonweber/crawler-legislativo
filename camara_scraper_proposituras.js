import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Criar pasta de output se não existir
const outputDir = path.join(__dirname, 'proposituras');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

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

async function extrairLinks(page) {
    return await page.evaluate(() => {
        const items = document.querySelectorAll('.data-list-item h4 a');
        return Array.from(items).map(item => ({
            titulo: item.textContent.trim(),
            link: item.href
        }));
    });
}

async function extrairLinksDocumentos(page) {
    return await page.evaluate(() => {
        const links = [];
        const rows = document.querySelectorAll('.table-striped tbody tr');
        
        for (const row of rows) {
            const link = row.querySelector('a');
            if (link) {
                const texto = link.textContent.trim();
                // Determina a extensão baseado no texto do link
                let extensao = 'pdf';  // extensão padrão
                if (texto.toLowerCase().includes('modelo_requerimento')) {
                    extensao = 'doc';
                } else if (texto.toLowerCase().includes('documento assinado')) {
                    extensao = 'pdf';
                }
                
                links.push({
                    texto: texto,
                    href: link.href,
                    extensao: extensao
                });
            }
        }
        
        return links;
    });
}

async function processarPagina(page, paginaAtual) {
    console.log(`\nProcessando página ${paginaAtual}...`);
    
    // Extrair links dos documentos
    const documentos = await extrairLinks(page);
    
    console.log(`Foram encontrados ${documentos.length} documentos na página ${paginaAtual}:`);
    
    // Array para armazenar informações dos documentos
    const documentosInfo = [];
    
    // Processar cada documento
    for (let i = 0; i < documentos.length; i++) {
        const doc = documentos[i];
        console.log(`\nProcessando documento ${i + 1} de ${documentos.length} da página ${paginaAtual}:`);
        console.log('Título:', doc.titulo);
        console.log('Link:', doc.link);
        
        // Criar pasta para o documento
        const docDir = path.join(outputDir, sanitizeFileName(doc.titulo));
        if (!fs.existsSync(docDir)) {
            fs.mkdirSync(docDir, { recursive: true });
        }
        
        // Criar uma nova página para cada documento
        const novaPagina = await page.browser().newPage();
        console.log('Abrindo nova página...');
        await novaPagina.goto(doc.link);
        
        // Extrair links de documentos
        const linksDocumentos = await extrairLinksDocumentos(novaPagina);
        
        // Salvar PDF da página
        console.log('Salvando PDF...');
        const pdfPath = path.join(docDir, `${sanitizeFileName(doc.titulo)}.pdf`);
        await novaPagina.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true
        });
        
        // Aguardar o diálogo de impressão
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const docLinks = [];

        // Caminhos dos arquivos
        for (const link of linksDocumentos) {
            const nomeArquivo = `${sanitizeFileName(doc.titulo)}_${sanitizeFileName(link.texto)}.${link.extensao}`;
            const caminhoArquivo = path.join(docDir, nomeArquivo);
        
            try {
                console.log(`Baixando: ${link.href}`);
                await baixarArquivo(link.href, caminhoArquivo);
            } catch (err) {
                console.error(`Erro ao baixar ${link.href}:`, err.message);
            }
        
            docLinks.push({
                tipo: link.extensao,
                caminho: caminhoArquivo
            });
        }

        // Adicionar informações ao array
        documentosInfo.push({
            titulo: doc.titulo,
            pasta: docDir,
            pdf: pdfPath,
            documentos: docLinks,
            pagina: paginaAtual
        });
        
        // Fechar a página atual
        await novaPagina.close();
        console.log('Página fechada.');
        
        console.log('----------------------------------------');
    }

    return documentosInfo;
}

async function main() {
    const apenasUmaPagina = process.argv.includes('--uma-pagina');

    const documentosInfoPath = path.join(outputDir, 'documentos_info.json');

    let paginaAtual = 1;

    // Verifica se o arquivo documentos_info.json existe e se contém dados
    if (fs.existsSync(documentosInfoPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(documentosInfoPath));
            if (data.length > 0) {
                // Pegando a última entrada
                const ultimaPagina = data[data.length - 1].pagina;
                paginaAtual = ultimaPagina; // Inicia da página seguinte
                console.log(`Retomando a partir da página ${paginaAtual}...`);
            }
        } catch (e) {
            console.error('Erro ao ler documentos_info.json:', e.message);
        }
    }

    try {
        const page = await browser.newPage();
      
        // biome-ignore lint/style/useConst: <explanation>
        let temProximaPagina = true;
        const todosDocumentosInfo = [];
        
        while (temProximaPagina) {
            // Acessar a página atual
            const url = `https://rioclaro.siscam.com.br/Documentos/Pesquisa?Pesquisa=Avancada&id=80&pagina=${paginaAtual}&Modulo=8&Documento=0&Numeracao=Documento&NumeroInicial=&AnoInicial=&DataInicial=&NumeroFinal=&AnoFinal=&DataFinal=&Situacao=0&TipoAutor=Todos&AutoriaId=0&Iniciativa=Nenhum&NoTexto=false&Assunto=a&Observacoes=`;
            
            console.log(`\nAcessando página ${paginaAtual}...`);
            await page.goto(url);
            await page.waitForSelector('.data-list-item');

            // Processar a página atual
            const documentosInfo = await processarPagina(page, paginaAtual);
            todosDocumentosInfo.push(...documentosInfo);
                paginaAtual++;
                if (apenasUmaPagina) break;
                console.log(`\nPreparando para processar página ${paginaAtual}...`);
        
        }
        const csvPath = path.join(outputDir, 'documentos_info.csv');
        
        const stream = fs.createWriteStream(csvPath, { flags: 'w', encoding: 'utf-8' });

        const csvHeaders = ['Título', 'Pasta', 'PDF', 'Tipo do Arquivo', 'Caminho do Arquivo', 'Página'];
        const linhasCsv = [csvHeaders.join(',')];
        // Salvar informações em um arquivo JSON
        
        const infoPath = path.join(outputDir, 'documentos_info.json');
        stream.write('Título,Pasta,PDF,Tipo do Arquivo,Caminho do Arquivo,Página\n');

        for (const doc of todosDocumentosInfo) {
            if (doc.documentos.length > 0) {
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
                // Caso o documento não tenha arquivos anexos
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

        // Manter a página aberta por mais 1 minuto
        console.log(`\nProcessando página ${paginaAtual} de ${paginaAtual + 1}...`);
        // Não há código para inserir neste ponto
        console.log('\nMantendo página aberta por mais 1 minuto...');


    } catch (error) {
        console.error('Ocorreu um erro:', error);
    } finally {
                fs.writeFileSync(infoPath, JSON.stringify(todosDocumentosInfo, null, 2));
                console.log(`\nInformações salvas em: ${infoPath}`);
              
        await browser.close();
    }
}

main(); 