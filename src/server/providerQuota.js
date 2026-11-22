export async function quotaFailure(response) {
  if (response.status === 402) return true;
  let data;
  try {data = await response.json();} catch {return false;}
  const text = [data?.message, data?.error?.message, data?.error?.type, data?.error?.code].filter(value=>typeof value==='string').join(' ');
  return /insufficient[_ -]credits|not enough credits|credits?.{0,30}(?:exhausted|depleted)|(?:monthly[_ -])?usage[_ -]limit[_ -]exceeded|not-enough-usage-to-run-paid-actor/i.test(text);
}
