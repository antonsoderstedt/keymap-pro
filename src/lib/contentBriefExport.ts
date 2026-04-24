import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, LevelFormat } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export interface ContentBrief {
  title: string;
  metaDescription: string;
  h1: string;
  targetWordCount: number;
  primaryKeyword: string;
  secondaryKeywords: string[];
  lsiTerms: string[];
  searchIntent: string;
  outline: { h2: string; summary: string; h3s?: string[] }[];
  faq: { q: string; a: string }[];
  internalLinks: { anchor: string; targetCluster: string; why: string }[];
  externalReferences?: string[];
  cta: string;
  schemaMarkup?: string[];
}

const safeName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function briefToMarkdown(cluster: string, b: ContentBrief): string {
  return `# Content Brief: ${cluster}

**Primärt sökord:** ${b.primaryKeyword}
**Mål-ordantal:** ${b.targetWordCount} ord
**Search intent:** ${b.searchIntent}

## SEO-meta
- **Title:** ${b.title}
- **Meta description:** ${b.metaDescription}

## Sidstruktur
**H1:** ${b.h1}

${b.outline.map((s, i) => `### ${i + 1}. ${s.h2}\n${s.summary}${s.h3s?.length ? "\n\nH3:\n" + s.h3s.map((h) => `- ${h}`).join("\n") : ""}`).join("\n\n")}

## Sekundära sökord
${b.secondaryKeywords.map((k) => `- ${k}`).join("\n")}

## LSI / entiteter att inkludera
${b.lsiTerms.map((k) => `- ${k}`).join("\n")}

## FAQ (PAA)
${b.faq.map((f) => `**Q:** ${f.q}\n**A:** ${f.a}`).join("\n\n")}

## Interna länkar
${b.internalLinks.map((l) => `- [${l.anchor}] → kluster "${l.targetCluster}" (${l.why})`).join("\n")}

${b.externalReferences?.length ? `## Auktoritativa källor att referera\n${b.externalReferences.map((r) => `- ${r}`).join("\n")}\n` : ""}
${b.schemaMarkup?.length ? `## Schema.org\n${b.schemaMarkup.map((s) => `- ${s}`).join("\n")}\n` : ""}
## CTA
${b.cta}
`;
}

export function downloadBriefMarkdown(cluster: string, b: ContentBrief) {
  const md = briefToMarkdown(cluster, b);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `brief-${safeName(cluster)}.md`);
}

export function downloadBriefJSON(cluster: string, b: ContentBrief) {
  const blob = new Blob([JSON.stringify({ cluster, ...b }, null, 2)], { type: "application/json" });
  saveAs(blob, `brief-${safeName(cluster)}.json`);
}

export async function downloadBriefDOCX(cluster: string, b: ContentBrief) {
  const para = (text: string, opts: any = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
  const heading = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]) =>
    new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })], spacing: { before: 240, after: 120 } });
  const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(text)] });

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `Content Brief: ${cluster}`, bold: true })], alignment: AlignmentType.LEFT }),
    para(`Primärt sökord: ${b.primaryKeyword}`, { bold: true }),
    para(`Mål-ordantal: ${b.targetWordCount} ord`),
    para(`Search intent: ${b.searchIntent}`),

    heading("SEO-meta", HeadingLevel.HEADING_1),
    para(`Title: ${b.title}`),
    para(`Meta description: ${b.metaDescription}`),

    heading("Sidstruktur", HeadingLevel.HEADING_1),
    para(`H1: ${b.h1}`, { bold: true }),
  ];

  b.outline.forEach((s, i) => {
    children.push(heading(`${i + 1}. ${s.h2}`, HeadingLevel.HEADING_2));
    children.push(para(s.summary));
    if (s.h3s?.length) s.h3s.forEach((h) => children.push(bullet(h)));
  });

  children.push(heading("Sekundära sökord", HeadingLevel.HEADING_1));
  b.secondaryKeywords.forEach((k) => children.push(bullet(k)));

  children.push(heading("LSI / entiteter", HeadingLevel.HEADING_1));
  b.lsiTerms.forEach((k) => children.push(bullet(k)));

  children.push(heading("FAQ (PAA)", HeadingLevel.HEADING_1));
  b.faq.forEach((f) => {
    children.push(para(`Q: ${f.q}`, { bold: true }));
    children.push(para(`A: ${f.a}`));
  });

  children.push(heading("Interna länkar", HeadingLevel.HEADING_1));
  b.internalLinks.forEach((l) => children.push(bullet(`${l.anchor} → "${l.targetCluster}" (${l.why})`)));

  if (b.externalReferences?.length) {
    children.push(heading("Auktoritativa källor", HeadingLevel.HEADING_1));
    b.externalReferences.forEach((r) => children.push(bullet(r)));
  }

  if (b.schemaMarkup?.length) {
    children.push(heading("Schema.org", HeadingLevel.HEADING_1));
    b.schemaMarkup.forEach((s) => children.push(bullet(s)));
  }

  children.push(heading("CTA", HeadingLevel.HEADING_1));
  children.push(para(b.cta));

  const doc = new Document({
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }],
    },
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: "Arial" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial" }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: "Arial" }, paragraph: { spacing: { after: 240 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  });

  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `brief-${safeName(cluster)}.docx`);
}

export function downloadBriefPDF(cluster: string, b: ContentBrief) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 50;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - margin) { pdf.addPage(); y = margin; }
  };
  const addText = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(opts.size ?? 11);
    if (opts.color) pdf.setTextColor(...opts.color); else pdf.setTextColor(0, 0, 0);
    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeight = (opts.size ?? 11) * 1.35;
    lines.forEach((ln: string) => {
      ensureSpace(lineHeight);
      pdf.text(ln, margin, y);
      y += lineHeight;
    });
  };
  const addGap = (g = 8) => { y += g; };

  addText(`Content Brief: ${cluster}`, { size: 18, bold: true });
  addGap(6);
  addText(`Primärt sökord: ${b.primaryKeyword}`, { bold: true });
  addText(`Mål-ordantal: ${b.targetWordCount} ord`);
  addText(`Search intent: ${b.searchIntent}`);
  addGap();

  addText("SEO-meta", { size: 14, bold: true });
  addText(`Title: ${b.title}`);
  addText(`Meta description: ${b.metaDescription}`);
  addGap();

  addText("Sidstruktur", { size: 14, bold: true });
  addText(`H1: ${b.h1}`, { bold: true });
  b.outline.forEach((s, i) => {
    addGap(4);
    addText(`${i + 1}. ${s.h2}`, { size: 12, bold: true });
    addText(s.summary);
    if (s.h3s?.length) s.h3s.forEach((h) => addText(`  • ${h}`));
  });
  addGap();

  addText("Sekundära sökord", { size: 14, bold: true });
  b.secondaryKeywords.forEach((k) => addText(`• ${k}`));
  addGap();

  addText("LSI / entiteter", { size: 14, bold: true });
  b.lsiTerms.forEach((k) => addText(`• ${k}`));
  addGap();

  addText("FAQ (PAA)", { size: 14, bold: true });
  b.faq.forEach((f) => {
    addText(`Q: ${f.q}`, { bold: true });
    addText(`A: ${f.a}`);
    addGap(4);
  });

  addText("Interna länkar", { size: 14, bold: true });
  b.internalLinks.forEach((l) => addText(`• ${l.anchor} → "${l.targetCluster}" (${l.why})`));
  addGap();

  if (b.externalReferences?.length) {
    addText("Auktoritativa källor", { size: 14, bold: true });
    b.externalReferences.forEach((r) => addText(`• ${r}`));
    addGap();
  }
  if (b.schemaMarkup?.length) {
    addText("Schema.org", { size: 14, bold: true });
    b.schemaMarkup.forEach((s) => addText(`• ${s}`));
    addGap();
  }
  addText("CTA", { size: 14, bold: true });
  addText(b.cta);

  pdf.save(`brief-${safeName(cluster)}.pdf`);
}
