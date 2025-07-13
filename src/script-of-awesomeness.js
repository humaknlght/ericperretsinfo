"use strict";
{
    // --- Utility Functions ---
    /**
     * Generates a random integer between 0 (inclusive) and max (exclusive).
     *
     * @param {number} max The upper bound (exclusive) for the random number.
     * @returns {number} A random integer.
     */
    function randInt(max) {
        return Math.floor(Math.random() * max);
    }
    const backgroundTheme = [
            "#232323", "#969ab2",
            "#52504d", "##e3c6b0",
            "#f8a688", "#707885"
        ],
        colors = ["orange", "blue", "grey", "hide", "pattern", ""],
        backgroundOptions = [
            {num: 36, className: "option1"},
            {num: 7 , className: "option2"},
            {num: 36, className: "option3"}
        ];
    let bgImgIndex = randInt(8),
        colorOption,
        refresh = document.querySelector(".changeColor svg");

    // Preload image
    const i = new Image();
    i.decoding = "async";
    i.src=`img/bg${bgImgIndex}.webp`;

    /**
     * Sets the background image for the document.
     *
     * @param {number} index The index of the background image.
     */
    function setBackgroundImg(index) {
        document.documentElement.style.setProperty("--bgUrl", `url(img/bg${index}.webp)`);
        document.querySelector("meta[name=theme-color]").setAttribute("content", backgroundTheme[index] || backgroundTheme[0]);
    }

    /**
     * Sets up the background grid and image.
     *
     * @param {object} options Options for the background, including num and className.
     */
    function setBackground(options) {
        const background = document.querySelector(".background");
        document.documentElement.style.setProperty("--gridRows", options.num);
        setBackgroundImg(bgImgIndex);
        if (options.num * options.num !== background.children.length) {
            background.innerHTML = new Array(options.num * options.num).fill("<div><div></div></div>").join("");
        }
        background.classList.remove(...backgroundOptions.map(opt => opt.className))
        background.classList.add(options.className);
    }

    /**
     * Changes the color class of a target element.
     *
     * @param {HTMLElement} targetEl The element whose class needs to be changed.
     * @param {boolean} allowDupes Whether to allow the new color to be the same as the current.
     */
    function changeColor(targetEl, allowDupes) {
        let newColor;
        do {
            let rand = randInt(8);
            newColor = colors[(rand === 6) ? 4 : rand];
        } while((newColor === targetEl.className) && !allowDupes);

        targetEl.className = newColor;
    }

    /**
     * Changes the background color of a target element's child to a grayscale rgba value.
     *
     * @param {HTMLElement} targetEl The parent element whose child's background color needs to be changed.
     * @param {boolean} allowDupes Whether to allow the new color to be the same as the current.
     */
    function changeColorGreyScale(targetEl, allowDupes) {
        const el = targetEl.children[0];
        let newColor;
        do {
            newColor = ((randInt(2) === 0) ? "rgba(0,0,0," : "rgba(255,255,255,") + (randInt(8) / 10) + ")";
        } while((newColor === el.style.backgroundColor) && !allowDupes);

        el.style.backgroundColor = newColor;
    }

    /**
     * Toggles the "invert" class on a target element.
     *
     * @param {HTMLElement} targetEl The element to toggle the "invert" class on.
     */
    function changeColorInvert(targetEl) {
        targetEl.classList.toggle("invert");
    }

    /**
     * Handles color changes based on an event target and current color option.
     * Uses event delegation for efficiency.
     * @param {Event} event The DOM event object.
     */
    function changeColorFromEvent(event) {
        // Find the closest parent div that is not .backgroundWrapper
        const div = event.target.closest(".background > div");
        if (div) {
            switch(colorOption) {
                case 0:
                    changeColor(div);
                    break;
                case 1:
                    changeColorGreyScale(div);
                    break;
                case 2:
                    changeColorInvert(div);
                    break; 
            }
        }
    }
    /**
     * Checks if an element is within the current viewport.
     *
     * @param {HTMLElement} element The DOM element to check.
     * @returns {boolean} True if the element is in the viewport, false otherwise.
     */
    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // --- Snake Game Logic ---

    let snakeIntervalId;
    function setupSnake() {
        function isDivHiddenOnScreen(div) {
            if (!div) {
                return true;
            }
            const rect = div.getBoundingClientRect();
            return !(
                rect.top >= 0
                && rect.left >= 0
                && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
                && rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        }
        function alreadyContains(classes) {
            return !classes || classes.contains("bottom") || classes.contains("right") || classes.contains("top") || classes.contains("left");
        }
        setBackground(backgroundOptions[2]);
        const background = document.querySelector(".background");
        const items = background.querySelectorAll("div > div > div > div");
        let index = randInt(items.length);
        document.querySelector(".content").scrollIntoView({behavior: "smooth"});
        snakeIntervalId = setInterval(() => {
            let direction = randInt(4);
            let clazz;
            for (var i = 4; i >= 0; i--) {
                if (direction === 0) {
                    if (isDivHiddenOnScreen(items[index - 1]) || alreadyContains(items[index - 1]?.classList)) {
                        direction = 3;
                        continue;
                    }
                    index--;
                    clazz = "bottom";
                } else if (direction === 1) {
                    if (isDivHiddenOnScreen(items[index + 36]) || alreadyContains(items[index + 36]?.classList)) {
                        direction = 0;
                        continue;
                    }
                    index += 36;
                    clazz = "right";
                } else if (direction === 2) {
                    if (isDivHiddenOnScreen(items[index + 1]) || alreadyContains(items[index + 1]?.classList)) {
                        direction = 1;
                        continue;
                    }
                    index++;
                    clazz = "top";
                } else if (direction === 3) {
                    if (isDivHiddenOnScreen(items[index - 36]) || alreadyContains(items[index - 36]?.classList)) {
                        direction = 2;
                        continue;
                    }
                    index -= 36;
                    clazz = "left";
                }
                items[index].classList.add(clazz);
                break;
            }
            if (i < 0) {
                index = randInt(items.length);
            }
        }, 200);
    }

    // --- Setup and Event Initialization ---

    function setup() {
        const selOpt = backgroundOptions[randInt(2)];
        if (document.documentElement.clientWidth >= 675) {
            colorOption = randInt(3);
            setBackground(selOpt);
            const background = document.querySelector(".background");
            background.addEventListener("mouseover", changeColorFromEvent, false);
            background.addEventListener("click", changeColorFromEvent, false);
        } else {
            selOpt.num = 1;
            setBackground(selOpt);
        }
    }
    /**
     * Handles background changes, clearing existing intervals and re-initializing.
     *
     * @param {boolean} isRefresh True if the change is a refresh, false for snake mode.
     */
    function changeBackground(isRefresh) {
        clearInterval(snakeIntervalId);
        isRefresh && refresh.classList.toggle("rotate");
        const background = document.querySelector(".background");
        background.className = "grid background";
        background.removeEventListener("mouseover", changeColorFromEvent);
        background.removeEventListener("click", changeColorFromEvent);
        let newBgImgIndex;
        do {
            newBgImgIndex = randInt(8);
        } while(bgImgIndex === newBgImgIndex);
        bgImgIndex = newBgImgIndex;
        isRefresh ? setup() : setupSnake();
    }
    refresh.addEventListener("animationend", () => {
        refresh.classList.toggle("rotate");
    });

    // --- Document Ready / Initialization ---

    function ready() {
        setup();
        document.querySelector(".navOpener > button").addEventListener("click", (button) => {
            button = button.currentTarget;
            button.classList.toggle("open");
            button.setAttribute("aria-expanded", (button.getAttribute("aria-expanded") === "false"));
            document.querySelector(".navHolder").classList.toggle("open")
        });
        document.querySelector(".changeColor > #refresh").addEventListener("click", (button) => {
            changeBackground(true);
        });
        document.querySelector(".changeColor > #🐍").addEventListener("click", (button) => {
            changeBackground();
        });
        document.querySelector("#me").addEventListener("click", (link) => {
            link = link.currentTarget;
            const div = document.createElement("div");
            div.className = "me";
            div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/EErY75MXYXI?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
            link.parentNode.replaceChild(div, link);
        });
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
        });
        document.querySelector("a.photos").addEventListener("click", (event) => {
            event.preventDefault();
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            document.body.classList.remove("show");
            document.body.classList.toggle("hide");
            document.querySelectorAll("a").forEach(a => a.tabIndex = -1);
            document.querySelectorAll("button").forEach(b => delete b.removeAttribute("tabIndex"));
            document.querySelector(".photoB>.r").disabled = (bgImgIndex === 7);
            document.querySelector(".photoB>.l").disabled = (bgImgIndex === 0);
        });
        document.querySelector(".photoB>.x").addEventListener("click", (event) => {
            event.preventDefault();
            document.body.classList.toggle("hide");
            document.body.classList.toggle("show");
            document.querySelectorAll("a").forEach(a => delete a.removeAttribute("tabIndex"));
            document.querySelectorAll("button").forEach(b => b.tabIndex = -1);
        });
        document.querySelector(".photoB>.l").addEventListener("click", (event) => {
            event.preventDefault();
            setBackgroundImg(--bgImgIndex);
            if (bgImgIndex === 0) {
                event.target.disabled = true;
            } else if (bgImgIndex === 6) {
                document.querySelector(".photoB>.r").disabled = false;
            }
        });
        document.querySelector(".photoB>.r").addEventListener("click", (event) => {
            event.preventDefault();
            setBackgroundImg(++bgImgIndex);
            if (bgImgIndex === 1) {
                document.querySelector(".photoB>.l").disabled = false;
            } else if (bgImgIndex === 7) {
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
            window.addEventListener("DOMContentLoaded", ready());
    }
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'UA-39357422-1');
}