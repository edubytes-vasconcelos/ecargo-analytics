import fs from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'docs', 'manual-gestao-atividades.md'), 'utf8');
const output = path.join(root, 'static', 'projects', 'manual-gestao-atividades.docx');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function runs(value) {
  return String(value).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part) => {
    const emphasized = (part.startsWith('**') && part.endsWith('**')) || (part.startsWith('`') && part.endsWith('`'));
    const text = emphasized ? part.slice(part.startsWith('**') ? 2 : 1, part.startsWith('**') ? -2 : -1) : part;
    return `<w:r>${emphasized ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }).join('');
}

function paragraph(value, style = 'Normal', listNumber = null) {
  const pStyle = style ? `<w:pStyle w:val="${style}"/>` : '';
  const indent = listNumber === null ? '' : '<w:tabs><w:tab w:val="left" w:pos="420"/></w:tabs><w:ind w:left="420" w:hanging="420"/>';
  const content = listNumber === null ? runs(value) : `<w:r><w:t>${listNumber}.</w:t></w:r><w:r><w:tab/></w:r>${runs(value)}`;
  return `<w:p><w:pPr>${pStyle}${indent}</w:pPr>${content}</w:p>`;
}

function cell(value, width, fill, isHeader = false) {
  const color = isHeader ? 'FFFFFF' : '172B34';
  const fillXml = fill ? `<w:shd w:fill="${fill}"/>` : '';
  const runProps = `<w:rPr><w:sz w:val="${isHeader ? 20 : 19}"/>${isHeader ? '<w:b/>' : ''}<w:color w:val="${color}"/></w:rPr>`;
  const text = esc(value.trim());
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fillXml}<w:vAlign w:val="center"/><w:tcMar><w:top w:w="110" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="60" w:line="250" w:lineRule="auto"/></w:pPr><w:r>${runProps}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

function table(rows) {
  const widths = [2450, 6900];
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="5" w:color="D9E1E5"/><w:left w:val="single" w:sz="5" w:color="D9E1E5"/><w:bottom w:val="single" w:sz="5" w:color="D9E1E5"/><w:right w:val="single" w:sz="5" w:color="D9E1E5"/><w:insideH w:val="single" w:sz="5" w:color="D9E1E5"/><w:insideV w:val="single" w:sz="5" w:color="D9E1E5"/></w:tblBorders>';
  const tableRows = rows.map((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    const fill = isHeader ? '155B63' : rowIndex % 2 ? 'F0F5F6' : 'FFFFFF';
    const head = isHeader ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : '';
    return `<w:tr>${head}${row.map((value, i) => cell(value, widths[i], fill, isHeader)).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9350" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${widths[0]}"/><w:gridCol w:w="${widths[1]}"/></w:tblGrid>${tableRows}</w:tbl>`;
}

const lines = source.replaceAll('\r', '').split('\n');
const body = [];
let index = 0;
let firstSubtitle = true;
while (index < lines.length) {
  const line = lines[index].trim();
  if (!line) { index++; continue; }
  if (line.startsWith('|')) {
    const rows = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      const raw = lines[index].trim();
      const fields = raw.slice(1, -1).split('|').map((field) => field.trim());
      if (!fields.every((field) => /^:?-{3,}:?$/.test(field))) rows.push(fields);
      index++;
    }
    body.push(table(rows));
    body.push(paragraph('', 'Spacer'));
    continue;
  }
  if (line.startsWith('# ')) { body.push(paragraph(line.slice(2), 'Title')); index++; continue; }
  if (line.startsWith('## ')) {
    if (firstSubtitle) { body.push(paragraph(line.slice(3), 'Subtitle')); firstSubtitle = false; }
    else body.push(paragraph(line.slice(3), 'Heading1'));
    index++;
    continue;
  }
  if (line.startsWith('### ')) { body.push(paragraph(line.slice(4), 'Heading2')); index++; continue; }
  const numbered = line.match(/^(\d+)\.\s+(.*)$/);
  if (numbered) { body.push(paragraph(numbered[2], 'ListParagraph', numbered[1])); index++; continue; }
  if (line.startsWith('- ')) { body.push(paragraph(`•  ${line.slice(2)}`, 'ListParagraph')); index++; continue; }
  body.push(paragraph(line, 'Normal'));
  index++;
}

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1050" w:bottom="1080" w:left="1050" w:header="500" w:footer="520" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos"/><w:sz w:val="21"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="130" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:color w:val="172B34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="110"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="54"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240"/></w:pPr><w:rPr><w:sz w:val="25"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="330" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="85" w:line="285" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="60" w:after="100"/></w:pPr><w:rPr><w:sz w:val="4"/></w:rPr></w:style></w:styles>`;

const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/><w:color w:val="000000"/></w:rPr><w:t>E-Cargo | Gestão de atividades</w:t></w:r></w:p></w:hdr>`;
const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/><w:color w:val="657783"/></w:rPr><w:t>Manual de uso  •  </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="420"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Manual de uso da gestão de atividades</dc:title><dc:subject>Guia prático para uso do painel E-Cargo</dc:subject><dc:language>pt-BR</dc:language><dc:creator>E-Cargo</dc:creator></cp:coreProperties>`;
const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Word</Application></Properties>`;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const compressed = deflateRawSync(raw, { level: 8 });
    const crc = crc32(raw);
    const date = ((2026 - 1980) << 9) | (11 << 5) | 3;
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26); local.writeUInt16LE(0, 28); filename.copy(local, 30);
    localParts.push(local, compressed);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42); filename.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(centralParts.length, 8); end.writeUInt16LE(centralParts.length, 10); end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const entries = {
  '[Content_Types].xml': contentTypes,
  '_rels/.rels': packageRels,
  'docProps/core.xml': coreXml,
  'docProps/app.xml': appXml,
  'word/document.xml': documentXml,
  'word/styles.xml': stylesXml,
  'word/settings.xml': settingsXml,
  'word/header1.xml': headerXml,
  'word/footer1.xml': footerXml,
  'word/_rels/document.xml.rels': docRels,
};
await fs.writeFile(output, zip(entries));
nodeRepl.write({ created: output, sections: (source.match(/^## /gm) || []).length, bytes: (await fs.stat(output)).size });
