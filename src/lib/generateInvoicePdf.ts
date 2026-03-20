import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface PaymentDetails {
  hasBankTransfer: boolean;
  bankBsb?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  hasStripe: boolean;
  businessName?: string | null;
  phone?: string | null;
}

interface InvoicePdfData {
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  clientName: string;
  contractorBusinessName: string;
  contractorPhone: string | null;
  contractorLogoUrl: string | null;
  lineItems: LineItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
  gstRegistered: boolean;
  notes: string | null;
  paymentDetails?: PaymentDetails;
}

export const generateInvoicePdf = async (data: InvoicePdfData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Try to load logo
  if (data.contractorLogoUrl) {
    try {
      const img = await loadImage(data.contractorLogoUrl);
      doc.addImage(img, "PNG", 14, y, 30, 30);
    } catch {
      // Skip logo if it can't be loaded
    }
  }

  // Header — business name
  const headerX = data.contractorLogoUrl ? 50 : 14;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.contractorBusinessName || "Invoice", headerX, y + 8);

  if (data.contractorPhone) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(data.contractorPhone, headerX, y + 15);
  }

  // Invoice title right-aligned
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 163, 74); // primary green
  const label = data.gstRegistered ? "TAX INVOICE" : "INVOICE";
  doc.text(label, pageWidth - 14, y + 8, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y = 58;

  // Invoice details
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice #:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.invoiceNumber || "—", 50, y);

  doc.setFont("helvetica", "bold");
  doc.text("Date:", 14, y + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.createdAt, 50, y + 7);

  if (data.dueDate) {
    doc.setFont("helvetica", "bold");
    doc.text("Due:", 14, y + 14);
    doc.setFont("helvetica", "normal");
    doc.text(data.dueDate, 50, y + 14);
  }

  // Bill to
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", pageWidth / 2 + 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.clientName, pageWidth / 2 + 10, y + 7);

  y = data.dueDate ? y + 28 : y + 22;

  // Line items table
  const tableBody = data.lineItems.map((li) => [
    li.description,
    String(li.quantity),
    `$${li.unit_price.toFixed(2)}`,
    `$${(li.quantity * li.unit_price).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [22, 163, 74],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // Totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  const totalsX = pageWidth - 70;
  doc.setFontSize(10);

  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", totalsX, y);
  doc.text(`$${data.subtotal.toFixed(2)}`, pageWidth - 14, y, { align: "right" });

  if (data.gstRegistered) {
    y += 7;
    doc.text("GST (10%):", totalsX, y);
    doc.text(`$${data.gstAmount.toFixed(2)}`, pageWidth - 14, y, { align: "right" });
  }

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total:", totalsX, y);
  doc.text(`$${data.total.toFixed(2)}`, pageWidth - 14, y, { align: "right" });

  // Notes
  if (data.notes) {
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(noteLines, 14, y + 6);
    y += 6 + noteLines.length * 4.5;
  }

  // Payment Details section
  const pd = data.paymentDetails;
  if (pd) {
    y += 14;
    // Check we have room, else add page
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74);
    doc.text("Payment Details", 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;

    if (pd.hasStripe) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Pay by Card:", 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(`Contact ${pd.businessName || "us"} for a secure payment link.`, 50, y);
      y += 7;
    }

    if (pd.hasBankTransfer) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Pay by Bank Transfer:", 14, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      const bankDetails = [
        ["BSB:", pd.bankBsb || ""],
        ["Account:", pd.bankAccountNumber || ""],
        ["Name:", pd.bankAccountName || pd.businessName || ""],
        ["Reference:", data.invoiceNumber],
      ];
      bankDetails.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 18, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, 50, y);
        y += 5;
      });
    }

    if (!pd.hasStripe && !pd.hasBankTransfer) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const contactText = `Please contact ${pd.businessName || "us"}${pd.phone ? ` on ${pd.phone}` : ""} to arrange payment.`;
      doc.text(contactText, 14, y);
    }
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.text("Powered by Yardly", pageWidth / 2, footerY, { align: "center" });

  // File name
  const safeName = data.clientName.replace(/[^a-zA-Z0-9]/g, "-");
  const safeNum = (data.invoiceNumber || "Invoice").replace(/[^a-zA-Z0-9-]/g, "");
  doc.save(`${safeNum}-${safeName}.pdf`);
};

function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No context"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}
