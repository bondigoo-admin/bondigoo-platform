export const calculateVAT = (amount, isIncluded = true, vatRate = 8.1) => {
  const rate = vatRate / 100;
  
  if (isIncluded) {
    const netAmount = amount / (1 + rate);
    const vatAmount = amount - netAmount;
    return {
      netAmount: Number(netAmount.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2)),
      totalAmount: amount,
      vatRate
    };
  } else {
    const vatAmount = amount * rate;
    const totalAmount = amount + vatAmount;
    return {
      netAmount: amount,
      vatAmount: Number(vatAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      vatRate
    };
  }
};