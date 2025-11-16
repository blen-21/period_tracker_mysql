 
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// Arrays to store multiple cycle predictions
let predictedPeriodStarts = [];
let ovulationDates = [];
let fertileWindows = [];

window.onload = function () {
  document.getElementById("start-date").valueAsDate = new Date();
  renderCalendar();
};

async function handleCalculate() {
  const calculateBtn = document.getElementById("calculate-btn");
  const originalBtnText = calculateBtn.innerHTML;
  
  // Show loading state
  calculateBtn.innerHTML = `
    <div class="loading-text">
      <div class="loading-spinner"></div>
      Calculating...
    </div>
  `;
  calculateBtn.disabled = true;
  
  try {
    // Add a small delay to show the loading effect (even though the calculation is fast)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Perform the actual calculation
    await predictCycle();
  } catch (error) {
    console.error("Error calculating cycle:", error);
    document.getElementById("results").innerHTML = `
      <p>An error occurred while calculating your cycle. Please try again.</p>
    `;
  } finally {
    // Restore button state
    calculateBtn.innerHTML = originalBtnText;
    calculateBtn.disabled = false;
  }
}

function predictCycle() {
  return new Promise((resolve) => {
    const startDateInput = document.getElementById("start-date").value;

const loggedMoods = JSON.parse(localStorage.getItem('abeba-mood-database')) || [];


const symptomEntries = loggedMoods
  .map(entry => entry.mood.toLowerCase())
  .filter(symptom => ["tender breasts", "bloating"].includes(symptom));

let adjustmentDays = 0;
if (symptomEntries.includes("tender breasts")) {
  adjustmentDays = 2; 
} else if (symptomEntries.includes("bloating")) {
  adjustmentDays = 1; 
}

    const cycleLength = parseInt(document.getElementById("cycle-length").value);
    const lutealPhase = parseInt(document.getElementById("luteal-phase").value);
    const resultDiv = document.getElementById("results");

    if (!startDateInput || isNaN(cycleLength) || isNaN(lutealPhase)) {
      resultDiv.innerHTML = "<p>Please enter all required fields.</p>";
      resolve();
      return;
    }

    const startDate = new Date(startDateInput);
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 24); // Set to 24 months in future

    predictedPeriodStarts = [];
    ovulationDates = [];
    fertileWindows = [];

    const options = { year: "numeric", month: "long", day: "numeric" };

    let cycle = 1;
    let currentDate = new Date(startDate);

    while (true) {
      const periodStart = new Date(currentDate);
      periodStart.setDate(currentDate.getDate() + cycleLength - adjustmentDays);//adjusts the dates


      if (periodStart > maxDate) break;

      predictedPeriodStarts.push(periodStart);

      const ovulation = new Date(periodStart);
      ovulation.setDate(periodStart.getDate() - lutealPhase);
      ovulationDates.push(ovulation);

      //fertility window is 5 days not including the ovulation day because that is the most common
    const fertileStart = new Date(ovulation);
    fertileStart.setDate(ovulation.getDate() - 6); 
    const fertileEnd = new Date(ovulation);
    fertileEnd.setDate(ovulation.getDate() - 1);
    fertileWindows.push({ start: fertileStart, end: fertileEnd });

      currentDate = periodStart;
      cycle++;
    }


    currentMonth = predictedPeriodStarts[0].getMonth();
    currentYear = predictedPeriodStarts[0].getFullYear();
    renderCalendar();
    
    resolve();
  });
}

function changeMonth(offset) {
  currentMonth += offset;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
}

function renderCalendar() {
  const calendar = document.getElementById("calendar");
  const monthYear = document.getElementById("monthYear");
  calendar.innerHTML = "";

  const date = new Date(currentYear, currentMonth);
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();

  monthYear.textContent = date.toLocaleString("default", { month: "long", year: "numeric" });

  for (let i = 0; i < firstDay; i++) {
    calendar.innerHTML += `<div class="day empty"></div>`;
  }

  // Days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(currentYear, currentMonth, day);
    let classes = "day";
    let label = "";
    let icon = "";

    if (dateObj.toDateString() === today.toDateString()) {
      classes += " today";
    }

    // Check if date is an ovulation day
    let isOvulation = ovulationDates.some(ov => datesEqual(dateObj, ov));

    // Mark period days (5-day span)
    for (const start of predictedPeriodStarts) {
      for (let i = 0; i < 5; i++) {
        const periodDay = new Date(start);
        periodDay.setDate(start.getDate() + i);
        if (datesEqual(dateObj, periodDay)) {
          classes += " period-day";
          label = "Period";
          icon = "<i class='fas fa-moon'></i>";
          break;
        }
      }
      if (label) break;
    }

    // If not already labeled, mark ovulation day
    if (!label && isOvulation) {
      classes += " ovulation-day";
      label = "Ovulation";
      icon = "<i class='fas fa-egg'></i>";
    }

    // If not already labeled, mark fertile days
    if (!label) {
      for (const window of fertileWindows) {
        if (dateObj >= window.start && dateObj <= window.end) {
          classes += " fertile-day";
          label = "Fertile";
          icon = "<i class='fas fa-seedling'></i>";
          break;
        }
      }
    }

    calendar.innerHTML += `
      <div class="${classes}">
        <div class="day-number">${day}</div>
        ${label ? `<div class="day-label">${icon} ${label}</div>` : ""}
      </div>
    `;
  }
}

function datesEqual(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
