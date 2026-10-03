// Máscaras e regras de validação compartilhadas pela interface (e pela API da demo).
const Validation = (() => {
  const digits = (v) => String(v ?? "").replace(/\D/g, "");

  function cpfValid(cpf) {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const size of [9, 10]) {
      let total = 0;
      for (let i = 0; i < size; i++) total += Number(cpf[i]) * (size + 1 - i);
      if (((total * 10) % 11) % 10 !== Number(cpf[size])) return false;
    }
    return true;
  }

  const masks = {
    cpf: (v) => {
      const d = digits(v).slice(0, 11);
      return d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
    },
    phone: (v) => {
      const d = digits(v).slice(0, 11);
      if (d.length <= 2) return d.length ? `(${d}` : "";
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    cnh: (v) => digits(v).slice(0, 11),
    plate: (v) => {
      const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
      return s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
    },
  };

  const maxYear = () => new Date().getFullYear() + 1;

  // Cada regra devolve "" quando o valor é válido, ou a mensagem de erro.
  const rules = {
    required: (v) => (String(v ?? "").trim() ? "" : "Campo obrigatório"),
    fullname: (v) =>
      /^\p{L}[\p{L}'.-]*(?:[ '-]\p{L}[\p{L}'.-]*)+$/u.test(String(v).trim().replace(/\s+/g, " "))
        ? ""
        : "Informe nome e sobrenome, só com letras",
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? "" : "E-mail inválido"),
    password: (v) => {
      if (v.length < 8) return "A senha precisa de ao menos 8 caracteres";
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "A senha precisa ter letras e números";
      return new TextEncoder().encode(v).length > 72 ? "A senha pode ter no máximo 72 caracteres" : "";
    },
    cpf: (v) => {
      const d = digits(v);
      if (d.length < 11) return "CPF incompleto";
      return cpfValid(d) ? "" : "CPF inválido: confira os números";
    },
    phone: (v) => {
      const d = digits(v);
      if (d.length < 10) return "Telefone incompleto: informe DDD e número";
      if (d[0] === "0") return "DDD inválido";
      if (d.length === 11 && d[2] !== "9") return "Celular deve começar com 9 depois do DDD";
      return "";
    },
    cnh: (v) => {
      const d = digits(v);
      return d.length === 11 && !/^(\d)\1{10}$/.test(d) ? "" : "A CNH tem 11 dígitos";
    },
    plate: (v) =>
      /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(String(v).toUpperCase()) ? "" : "Placa inválida: use ABC-1234 ou ABC1D23",
    year: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1980 && n <= maxYear() ? "" : `Ano deve estar entre 1980 e ${maxYear()}`;
    },
    money: (v) => {
      const n = Number(String(v).replace(",", "."));
      if (!(n > 0)) return "Informe um valor maior que zero";
      return /^\d+([.,]\d{1,2})?$/.test(String(v)) ? "" : "Use no máximo 2 casas decimais";
    },
  };

  function passwordStrength(v) {
    if (!v) return 0;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Za-z]/.test(v) && /\d/.test(v)) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) score++;
    return score;
  }

  return { digits, cpfValid, masks, rules, passwordStrength };
})();
