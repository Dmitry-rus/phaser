
var Class = require('../../../utils/Class');
var GameObject = require('../../GameObject');
var Components = require('../../../components');
var CanvasPool = require('../../../dom/CanvasPool');
var TextRender = require('./TextRender');
var TextStyle = require('../TextStyle');
var GetTextSize = require('../GetTextSize');

var Text = new Class({

    Mixins: [
        Components.Alpha,
        Components.BlendMode,
        Components.GetBounds,
        Components.Origin,
        Components.ScaleMode,
        Components.Transform,
        Components.Visible,
        Components.Flip,
        TextRender
    ],

    initialize:

    function Text (state, x, y, text, style)
    {
        if (x === undefined) { x = 0; }
        if (y === undefined) { y = 0; }
        if (text === undefined) { text = ''; }

        GameObject.call(this, state);

        this.setPosition(x, y);
        this.setOrigin(0, 0);

        /**
         * @property {HTMLCanvasElement} canvas - The canvas element that the text is rendered.
         */
        this.canvas = CanvasPool.create(this);

        /**
         * @property {HTMLCanvasElement} context - The context of the canvas element that the text is rendered to.
         */
        this.context = this.canvas.getContext('2d');

        this.style = new TextStyle(this, style);

        this.autoRound = true;

        /**
         * The Regular Expression that is used to split the text up into lines, in
         * multi-line text. By default this is `/(?:\r\n|\r|\n)/`.
         * You can change this RegExp to be anything else that you may need.
         * @property {Object} splitRegExp
         */
        this.splitRegExp = /(?:\r\n|\r|\n)/;

        this.text = (Array.isArray(text)) ? text.join('\n') : text;

        this.resolution = 1;

        this.padding = { x: 0, y: 0 };

        this.width = 1;
        this.height = 1;

        this.gpuBuffer = null;
        this.prevWidth = this.canvas.width;
        this.prevHeight = this.canvas.height;

        if (text !== '')
        {
            this.updateText();
        }
    },

    setText: function (value)
    {
        if (Array.isArray(value))
        {
            value = value.join('\n');
        }

        if (value !== this.text)
        {
            this.text = value;

            this.updateText();
        }

        return this;
    },

    setStyle: function (style)
    {
        return this.style.setStyle(style);
    },

    setFont: function (font)
    {
        return this.style.setFont(font);
    },

    setFixedSize: function (width, height)
    {
        return this.style.setFixedSize(width, height);
    },

    setBackgroundColor: function (color)
    {
        return this.style.setBackgroundColor(color);
    },

    setFill: function (color)
    {
        return this.style.setFill(color);
    },

    setStroke: function (color, thickness)
    {
        return this.style.setStroke(color, thickness);
    },

    setShadow: function (x, y, color, blur, shadowStroke, shadowFill)
    {
        return this.style.setShadow(x, y, color, blur, shadowStroke, shadowFill);
    },

    setShadowOffset: function (x, y)
    {
        return this.style.setShadowOffset(x, y);
    },

    setShadowColor: function (color)
    {
        return this.style.setShadowColor(color);
    },

    setShadowBlur: function (blur)
    {
        return this.style.setShadowBlur(blur);
    },

    setShadowStroke: function (enabled)
    {
        return this.style.setShadowStroke(enabled);
    },

    setShadowFill: function (enabled)
    {
        return this.style.setShadowFill(enabled);
    },

    setAlign: function (align)
    {
        return this.style.setAlign(align);
    },

    setMaxLines: function (max)
    {
        return this.style.setMaxLines(max);
    },

    updateText: function ()
    {
        var canvas = this.canvas;
        var context = this.context;
        var style = this.style;
        var size = style.metrics;

        var outputText = this.text;

        // if (style.wordWrap)
        // {
        //     outputText = this.runWordWrap(this.text);
        // }

        //  Split text into lines
        var lines = outputText.split(this.splitRegExp);

        var textSize = GetTextSize(this, size, lines);

        if (!style.fixedWidth)
        {
            this.width = textSize.width;
        }

        if (!style.fixedHeight)
        {
            this.height = textSize.height;
        }

        this.updateOrigin();

        var w = textSize.width * this.resolution;
        var h = textSize.height * this.resolution;

        if (canvas.width !== w || canvas.height !== h)
        {
            canvas.width = w;
            canvas.height = h;
        }
        else
        {
            context.clearRect(0, 0, w, h);
        }

        if (style.backgroundColor)
        {
            context.fillStyle = style.backgroundColor;
            context.fillRect(0, 0, w, h);
        }

        style.syncFont(canvas, context);

        var linePositionX;
        var linePositionY;

        //  Draw text line by line
        for (var i = 0; i < textSize.lines; i++)
        {
            linePositionX = style.strokeThickness / 2;
            linePositionY = (style.strokeThickness / 2 + i * textSize.lineHeight) + size.ascent;

            if (i > 0)
            {
                linePositionY += (textSize.lineSpacing * i);
            }

            if (style.align === 'right')
            {
                linePositionX += textSize.width - textSize.lineWidths[i];
            }
            else if (style.align === 'center')
            {
                linePositionX += (textSize.width - textSize.lineWidths[i]) / 2;
            }

            if (this.autoRound)
            {
                linePositionX = Math.round(linePositionX);
                linePositionY = Math.round(linePositionY);
            }

            if (style.strokeThickness)
            {
                this.style.syncShadow(context, style.shadowStroke);

                context.strokeText(lines[i], linePositionX, linePositionY);
            }

            if (style.fill)
            {
                this.style.syncShadow(context, style.shadowFill);

                context.fillText(lines[i], linePositionX, linePositionY);
            }
        }

        if (this.state.game.config.renderType === Phaser.WEBGL)
        {
            this.uploadToGPU();
        }

        return this;
    },

    uploadToGPU: function ()
    {
        var gl = this.state.game.renderer.gl;
        var currentTexture2D = this.state.game.renderer.currentTexture2D;
        var canvas = this.canvas;

        if (this.gpuBuffer === null)
        {
            this.gpuBuffer = gl.createTexture();
        }
        
        if (this.prevWidth < canvas.width || this.prevHeight < canvas.height)
        {
            /* New canvas is too big. We need to reallocate the texture */
            gl.bindTexture(gl.TEXTURE_2D, this.gpuBuffer);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.prevWidth = canvas.width;
            this.prevHeight = canvas.height;
        } 
        else 
        {
            /* if the canvas is smaller we just update the resource */
            gl.bindTexture(gl.TEXTURE_2D, this.gpuBuffer);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        }

        /* we must rebind old texture */
        gl.bindTexture(gl.TEXTURE_2D, currentTexture2D);
    }
});

module.exports = Text;
