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

// Configure CORS for Angular frontend (http://localhost:4200)
var allowedOrigins = builder.Configuration.GetSection("Scepter:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:4200"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("ScepterFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Register ForegroundTracker as both singleton and hosted background service
builder.Services.AddSingleton<ForegroundTracker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ForegroundTracker>());
builder.Services.AddSingleton<IWindowService, WindowService>();

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

app.UseCors("ScepterFrontend");
app.MapControllers();

app.Run();

