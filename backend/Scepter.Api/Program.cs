using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Scepter.Api.Native;
using Scepter.Api.Services;

// Declare per-monitor DPI awareness V2 at startup so pixel math matches real physical screen coordinates.
NativeMethods.ConfigureDpiAwareness();

var builder = WebApplication.CreateBuilder(args);

// Bind strictly to localhost:5000 by default
var configuredUrls = builder.Configuration["Urls"] ?? "http://localhost:5000";
builder.WebHost.UseUrls(configuredUrls);

// Configure JSON serialization (case-insensitive enums & camelCase properties)
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: true));
    })
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var firstError = context.ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault() ?? "Invalid request payload.";

            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new
            {
                success = false,
                error = "InvalidRequest",
                message = firstError
            });
        };
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title = "W.A.V.E Spatial Window Manager API",
        Version = "v1",
        Description = "Win32 P/Invoke window grab, snap & scroll engine for W.A.V.E (WAVEHUD)."
    });
});

// Configure CORS for Angular frontend (localhost:4200, Vercel deployments, and any origin connecting to local desktop daemon)
builder.Services.AddCors(options =>
{
    options.AddPolicy("ScepterFrontend", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Register ForegroundTracker as both singleton and hosted background service
builder.Services.AddSingleton<ForegroundTracker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ForegroundTracker>());
builder.Services.AddSingleton<IWindowService, WindowService>();
builder.Services.AddSingleton<IInputService, InputService>();
builder.Services.AddSingleton<ISceneService, SceneService>();

var app = builder.Build();

// Global exception handler returning clean JSON errors
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        var exception = feature?.Error;

        int statusCode = exception is PlatformNotSupportedException
            ? StatusCodes.Status501NotImplemented
            : StatusCodes.Status500InternalServerError;

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";

        var payload = new
        {
            success = false,
            error = exception?.GetType().Name ?? "InternalError",
            message = exception?.Message ?? "An unexpected error occurred."
        };

        await context.Response.WriteAsJsonAsync(payload);
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Support Chrome Private Network Access (PNA) preflight headers when a public HTTPS origin (like *.vercel.app)
// communicates with the user's local http://localhost:5000 desktop daemon.
app.Use(async (context, next) =>
{
    if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
    {
        context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
    }
    await next();
});

app.UseCors("ScepterFrontend");
app.MapControllers();

app.Run();

