// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BuyerV2",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(name: "BuyerV2", targets: ["BuyerV2"])
    ],
    targets: [
        .target(
            name: "BuyerV2",
            path: "Sources"
        ),
        .testTarget(
            name: "BuyerV2Tests",
            dependencies: ["BuyerV2"],
            path: "Tests"
        )
    ]
)
