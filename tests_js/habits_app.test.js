import { describe, expect, it, beforeEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "fs";
import path from "path";

const htmlContent = fs.readFileSync(path.resolve(__dirname, "../habits/index.html"), "utf8");
// Let's remove the script tag pointing to app.js from the html since we inject it manually to control execution
const normalizedHtml = htmlContent.replace('<script src="app.js"></script>', '');
const jsContent = fs.readFileSync(path.resolve(__dirname, "../habits/app.js"), "utf8");

describe("Habitus App E2E integration test via JSDOM", () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    // Setup virtual console to redirect JSDOM output to Node console
    const virtualConsole = new VirtualConsole();
    virtualConsole.sendTo(console);

    // Setup a clean JSDOM instance for each test
    dom = new JSDOM(normalizedHtml, { 
      runScripts: "dangerously",
      virtualConsole
    });
    window = dom.window;
    document = window.document;

    // Polyfill localStorage in JSDOM
    const localStorageMock = (() => {
      let store = {};
      return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
      };
    })();
    Object.defineProperty(window, "localStorage", { value: localStorageMock });

    // Polyfill confirm and alert
    window.confirm = () => true;
    window.alert = () => {};

    // Execute the app.js code in JSDOM by appending it
    const script = dom.window.document.createElement("script");
    script.textContent = jsContent;
    dom.window.document.body.appendChild(script);
  });

  it("deve carregar dados de demonstração por padrão no início", () => {
    // O bootstrap roda no carregamento. Vamos verificar se renderizou a lista de hábitos
    const habitsList = document.getElementById("today-habits-list");
    expect(habitsList.children.length).toBe(4); // 4 hábitos demo
  });

  it("deve exibir as consequências ativas hoje com base nos hábitos de ontem", () => {
    // Para testar de forma real, vamos voltar para ontem (July 16)
    const btnPrev = document.getElementById("btn-prev-day");
    btnPrev.click();

    // Ontem: o hábito de dormir cedo ("Dormir antes de 23:30") deve estar marcado pelo log demo
    // Vamos desmarcá-lo para que a consequência dispare hoje
    const habitItems = document.querySelectorAll(".habit-check-item");
    let sleptEarlyHabit = Array.from(habitItems).find(item => 
      item.querySelector(".habit-check-name").textContent.includes("Dormir")
    );
    
    expect(sleptEarlyHabit).toBeDefined();
    expect(sleptEarlyHabit.classList.contains("checked")).toBe(true);
    
    // Desmarca clicando
    sleptEarlyHabit.click();

    // Avança de volta para hoje (July 17)
    const btnNext = document.getElementById("btn-next-day");
    btnNext.click();

    // A consequência "Sem videogame hoje" (gerada por dormir tarde ontem) deve estar ativa hoje
    const todayConseqList = document.getElementById("today-consequences-list");
    expect(todayConseqList.innerHTML).toContain("Sem videogame hoje");
  });

  it("deve alternar a conclusão de um hábito ao clicar nele", () => {
    let habitItems = document.querySelectorAll(".habit-check-item");
    expect(habitItems.length).toBe(4);

    const firstHabit = habitItems[0];
    const isCheckedBefore = firstHabit.classList.contains("checked");
    
    // Clica para alternar status do hábito
    firstHabit.click();
    
    // Como a tela é re-renderizada do zero, buscamos o novo item renderizado no DOM
    const updatedHabitItems = document.querySelectorAll(".habit-check-item");
    const updatedFirstHabit = updatedHabitItems[0];
    expect(updatedFirstHabit.classList.contains("checked")).toBe(!isCheckedBefore);
  });

  it("deve prever a consequência de amanhã corretamente no Live Preview ao alterar hábitos hoje", () => {
    // Vamos desmarcar todos os hábitos de hoje e checar a previsão de amanhã
    let habitItems = document.querySelectorAll(".habit-check-item");
    
    // Força desmarcar os hábitos clicando neles se estiverem marcados
    habitItems.forEach(item => {
      if (item.classList.contains("checked")) {
        item.click();
      }
    });

    // Se todos os hábitos estão desmarcados hoje (falha):
    // A consequência c_1 ("Sem videogame hoje") requer h_3 (dormir antes de 23:30) desmarcado.
    // Portanto, amanhã deve ser disparada.
    const tomorrowConseqList = document.getElementById("tomorrow-consequences-list");
    expect(tomorrowConseqList.innerHTML).toContain("Sem videogame hoje");
  });
});
