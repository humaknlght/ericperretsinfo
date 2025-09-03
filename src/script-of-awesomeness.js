"use strict";
{
    // --- Utility Functions ---

    // --- Setup and Event Initialization ---
    /**
     * Sets the background image for the document.
     *
     * @param {number} index The index of the background image.
     */
    function setBackgroundImg(index, carouselContainer) {
        // The offset is now calculated based on the full viewport width of 100vw
        const offset = (-index * 90) + 5;

        // Add a transition for the slide effect
        carouselContainer.style.transition = 'transform 1.5s ease-in-out';
        carouselContainer.style.transform = `translateX(${offset}vw)`;
    }

    let originalSlides;
    let currentIndex = 1; // Start at index 1 to show the first original image
    let backgroundInterval;
    let animateCarousel;
    function setup() {
        const carouselContainer = document.querySelector(".carousel-container");
        const slides = document.querySelectorAll(".carousel-slide");
        // The total number of slides now includes the duplicates at the beginning and end
        const totalSlides = slides.length;
        originalSlides = totalSlides - 2;

        animateCarousel = () => {
            currentIndex++;
            setBackgroundImg(currentIndex, carouselContainer);
        }

        carouselContainer.addEventListener('transitionend', () => {
            // If we've reached the duplicated last slide at the end,
            // instantly reset the position to the original first slide
            if (currentIndex >= originalSlides + 1) {
                carouselContainer.style.transition = 'none';
                carouselContainer.style.transform = `translateX(-85vw)`;
                currentIndex = 1; // Reset index to the first original slide
            }
        });

        // Set an interval to trigger the next slide every 7 seconds (7000 milliseconds)
        backgroundInterval = setInterval(animateCarousel, 7000);
    }

    // --- Document Ready / Initialization ---

    function ready() {
        setup();
        document.querySelector(".navOpener > button").addEventListener("click", (button) => {
            button = button.currentTarget;
            button.classList.toggle("open");
            button.setAttribute("aria-expanded", (button.getAttribute("aria-expanded") === "false"));
            document.querySelector(".navHolder").classList.toggle("open")
        });
        document.querySelector("#me").addEventListener("click", (link) => {
            link = link.currentTarget;
            const div = document.createElement("div");
            div.className = "me";
            div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/EErY75MXYXI?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
            link.parentNode.replaceChild(div, link);
        });
        function artItemClick(event) {
            event.preventDefault();
            // Check if fullscreen is currently active
            if (document.fullscreenElement) {
                // If fullscreen, exit it
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) { // Safari
                    document.webkitExitFullscreen();
                }
            } else {
                const target = event.currentTarget.querySelector("img");
                // If not fullscreen, request it for the image
                if (target.requestFullscreen) {
                    target.requestFullscreen();
                } else if (target.webkitRequestFullscreen) { // Safari
                    target.webkitRequestFullscreen();
                }
            }
        }
        document.querySelector("a.art").addEventListener("click", async (event) => {
            event.preventDefault();
            const response = await fetch("art/");
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            const text = await response.text();
            const content = document.querySelector(".content");
            content.classList.add("art");
            content.querySelector("main").innerHTML = text;
            document.querySelectorAll(".artContent > a").forEach(a => a.addEventListener("click", artItemclick));
        });
        document.querySelector("a.photos").addEventListener("click", (event) => {
            event.preventDefault();
            clearInterval(backgroundInterval);
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            document.body.classList.remove("show");
            document.body.classList.toggle("hide");
            document.querySelectorAll("a").forEach(a => a.tabIndex = -1);
            document.querySelectorAll("button").forEach(b => delete b.removeAttribute("tabIndex"));
            document.querySelector(".photoB>.r").disabled = (currentIndex === originalSlides);
            document.querySelector(".photoB>.l").disabled = (currentIndex === 1);
        });
        document.querySelector(".photoB>.x").addEventListener("click", (event) => {
            event.preventDefault();
            // Reset the interval to trigger the next slide every 7 seconds (7000 milliseconds)
            backgroundInterval = setInterval(animateCarousel, 7000);
            document.body.classList.toggle("hide");
            document.body.classList.toggle("show");
            document.querySelectorAll("a").forEach(a => delete a.removeAttribute("tabIndex"));
            document.querySelectorAll("button").forEach(b => b.tabIndex = -1);
        });
        const carouselContainer = document.querySelector(".carousel-container");
        document.querySelector(".photoB>.l").addEventListener("click", (event) => {
            event.preventDefault();
            setBackgroundImg(--currentIndex, carouselContainer);
            if (currentIndex === 1) {
                event.target.disabled = true;
            } else if (currentIndex === (originalSlides - 1)) {
                document.querySelector(".photoB>.r").disabled = false;
            }
        });
        document.querySelector(".photoB>.r").addEventListener("click", (event) => {
            event.preventDefault();
            setBackgroundImg(++currentIndex, carouselContainer);
            if (currentIndex === 2) {
                document.querySelector(".photoB>.l").disabled = false;
            } else if (currentIndex === originalSlides) {
                event.target.disabled = true;
            }
        });
        if (window.location.search === "?art") {
            getAndLoadArt();
        }
    }
    switch(document.readyState) {
        case "interactive":
        case "complete":
            ready();
            break;
        default:
            window.addEventListener("DOMContentLoaded", ready);
    }
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'UA-39357422-1');
}