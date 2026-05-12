const xlsx = require('xlsx');
const path = require('path');

const excelPath = path.join(__dirname, '..', '..', 'client', 'assets', 'fake data', 'Travel.xlsx');

try {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log('Total Rows:', data.length);
    for (let i = 0; i < Math.min(data.length, 5); i++) {
        console.log(`Row ${i}:`, data[i]);
    }
    // Also log keys of the first row that has more than 3 keys
    const rowWithDesc = data.find(r => Object.keys(r).length > 3);
    if (rowWithDesc) {
        console.log('Row with more columns:', rowWithDesc);
    }
} catch (error) {
    console.error('Error reading Excel:', error);
}
