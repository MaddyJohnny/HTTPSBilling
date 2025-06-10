function generateContractContent(doc, data) {
    const pageWidth = doc.page.width;
    const leftColumnX = 50;
    const rightColumnX = pageWidth / 2 + 50;
    
    doc.fontSize(12)
       .font('fonts/Inter-Bold.otf')
       .text('ОПЕРАТОР', leftColumnX, 50)
       .font('fonts/Inter-Regular.otf')
       .text('ООО "ИнтерВектор"', leftColumnX)
       .moveDown(0.5)
       .text('Web сайт оператора: http://intervector.ru', leftColumnX)
       .moveDown(0.5)
       .text('Адрес: Коломна, ул. Ленина, д. 15, пом. 45', leftColumnX)
       .moveDown(0.5)
       .text('Телефон: +7 (496) 666-66-66', leftColumnX)
       .moveDown(0.5)
       .text('Почта: support@intervector.ru', leftColumnX);

    doc.font('fonts/Inter-Bold.otf')
       .text('АБОНЕНТ', rightColumnX, 50)
       .font('fonts/Inter-Regular.otf')
       .text(`ФИО: ${data.fullName}`, rightColumnX)
       .moveDown(0.5)
       .text(`Адрес регистрации: ${data.registrationAddress}`, rightColumnX)
       .moveDown(0.5)
       .text(`Документ: ${data.documentType}`, rightColumnX)
       .moveDown(0.5)
       .text(`Серия: ${data.documentSeries}`, rightColumnX)
       .moveDown(0.5)
       .text(`Номер: ${data.documentNumber}`, rightColumnX)
       .moveDown(0.5)
       .text(`Выдан: ${data.issuedBy}`, rightColumnX)
       .moveDown(0.5)
       .text(`Дата выдачи: ${data.issueDate}`, rightColumnX)
       .moveDown(0.5)
       .text(`Адрес подключения: ${data.connectionAddress}`, rightColumnX)
       .moveDown(0.5)
       .text(`Телефон: ${data.phone}`, rightColumnX);

    doc.moveDown(15);

    const centerX = pageWidth / 2;
    const contentWidth = 1000;
    const leftMargin = centerX - (contentWidth / 2);
    doc.font('fonts/Inter-Bold.otf')
    .fontSize(16)
    .text(`Договор №${data.contractNumber}`, leftMargin, 350, {
        width: contentWidth,
        align: 'center'
    })
    .font('fonts/Inter-Regular.otf')
    .text(`От ${data.contractDate}`, leftMargin, 370, {
        width: contentWidth,
        align: 'center'
    })

    doc.fontSize(12)
    .font('fonts/Inter-Bold.otf')
    .text('1. Параметры присоединения к сети электросвязи ООО "ИнтерВектор":', leftColumnX, 400, {
        width: contentWidth,
        align: 'left'
    })
    .font('fonts/Inter-Regular.otf')
    .text(`Адрес установки оборудования: ${data.connectionAddress}`, leftColumnX, 420, {
        width: contentWidth,
        align: 'left'
    })
    .text('Тип подключения: Выделенная линия', leftColumnX, 440, {
        width: contentWidth,
        align: 'left'
    });

    doc.font('fonts/Inter-Bold.otf')
    .text('2. Тарифный план:', leftColumnX, 470, {
        width: contentWidth,
        align: 'left'
    })
    .font('fonts/Inter-Regular.otf')
    .text(`Наименование тарифного плана: ${data.tariffName}`, leftColumnX, 490, {
        width: contentWidth,
        align: 'left'
    })
    .text(`Абонентская плата: ${data.tariffPrice ? data.tariffPrice + ' руб/мес' : 'Не определена'}`, leftColumnX, 510, {
        width: contentWidth,
        align: 'left'
    });

    doc.moveDown()
       .font('fonts/Inter-Bold.otf')
       .text('3. Настройки выделенной линии:', {
           align: 'left',
           width: pageWidth
       })
       .font('fonts/Inter-Regular.otf')
       .text(`IP адрес: ${data.ipAddress}`, {
           align: 'left',
           width: pageWidth
       })
       .text('Маска подсети: 250.250.250.250', {
           align: 'left',
           width: pageWidth
       })
       .text(`Шлюз: ${data.gateway}`, {
           align: 'left',
           width: pageWidth
       })
       .text('DNS сервер 1: 8.8.8.8', {
           align: 'left',
           width: pageWidth
       })
       .text('DNS сервер 2: 8.8.4.4', {
           align: 'left',
           width: pageWidth
       });

    doc.moveDown(2)
       .text(`Подпись Оператора ___________________ / ${data.operatorName}`, {
           align: 'left',
           width: pageWidth
       })
       .moveDown(0.5)
       .text(`Подпись Абонента ___________________ / ${data.fullName}`, {
           align: 'left',
           width: pageWidth
       });
}

module.exports = generateContractContent;
