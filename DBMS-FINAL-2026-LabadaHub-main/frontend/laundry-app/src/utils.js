export const peso = (n) =>
  '₱' +
  Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
