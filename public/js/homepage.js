const carousel = document.querySelector(".feature-carousel");
const nextBtn = document.querySelector(".carousel-btn.next");
const prevBtn = document.querySelector(".carousel-btn.prev");

const cardWidth = carousel.querySelector(".feature-card").offsetWidth + 24; // card + gap

nextBtn.addEventListener("click", () => {
  carousel.scrollBy({ left: cardWidth, behavior: "smooth" });
});

prevBtn.addEventListener("click", () => {
  carousel.scrollBy({ left: -cardWidth, behavior: "smooth" });
});

const petalCount = 100;
for (let i = 0; i < petalCount; i++) {
  const petal = document.createElement("div");
  petal.classList.add("petal");
  petal.style.left = `${Math.random() * 100}vw`;
  petal.style.bottom = `-${Math.random() * 100}px`;
  petal.style.animationDuration = `${8 + Math.random() * 5}s`;
  petal.style.animationDelay = `${Math.random() * 5}s`;
  petal.style.transform = `rotate(${Math.random() * 360}deg)`;
  document.body.appendChild(petal);
}
