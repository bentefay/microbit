cmake_minimum_required(VERSION 3.28.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(microbit_bluepad_report_only C)
set(ROOT /opt/bluepad)
set(BT ${ROOT}/btstack)
set(BP ${ROOT}/bluepad32/src/components/bluepad32)
set(BT_NAMES ad_parser btstack_crypto btstack_hid btstack_hid_parser btstack_linked_list btstack_linked_queue btstack_memory btstack_memory_pool btstack_ring_buffer btstack_run_loop btstack_run_loop_base btstack_tlv btstack_tlv_none btstack_util hci hci_cmd hci_dump hci_event hci_event_builder l2cap l2cap_signaling)
set(BT_SOURCES)
foreach(name ${BT_NAMES})
 list(APPEND BT_SOURCES ${BT}/src/${name}.c)
endforeach()
list(APPEND BT_SOURCES
 ${BT}/src/ble/att_db.c ${BT}/src/ble/att_dispatch.c ${BT}/src/ble/att_server.c
 ${BT}/src/ble/gatt_client.c ${BT}/src/ble/le_device_db_tlv.c ${BT}/src/ble/sm.c
 ${BT}/src/ble/gatt-service/hids_host.c
 ${BT}/src/ble/gatt-service/device_information_service_client.c
 ${BT}/src/ble/gatt-service/scan_parameters_service_client.c
 ${BT}/platform/zephyr/btstack_run_loop_zephyr.c
 ${BT}/platform/zephyr/hci_transport_zephyr.c
 ${BT}/platform/zephyr/hal_flash_bank_zephyr.c
 ${BT}/platform/embedded/btstack_tlv_flash_bank.c
 ${BT}/chipset/zephyr/btstack_chipset_zephyr.c
 ${BT}/3rd-party/micro-ecc/uECC.c
 ${BT}/3rd-party/rijndael/rijndael.c)
file(GLOB BP_SOURCES ${BP}/*.c ${BP}/bt/*.c ${BP}/controller/*.c ${BP}/parser/*.c)
list(REMOVE_ITEM BP_SOURCES ${BP}/bt/uni_bt_bredr.c ${BP}/bt/uni_bt_sdp.c ${BP}/uni_gpio.c ${BP}/uni_mouse_quadrature.c)
list(APPEND BP_SOURCES ${BP}/platform/uni_platform.c ${BP}/arch/uni_property_btstack_tlv.c)
target_sources(app PRIVATE main.c platform.c shims.c joystick_matrix.c ${BP_SOURCES} ${BT_SOURCES})
# Upstream uses ptrdiff_t without including its defining header. Newlib exposed
# it transitively; Picolibc does not. Supply the standard header for that file.
set_source_files_properties(${BP}/uni_hid_device.c PROPERTIES COMPILE_OPTIONS "-include;stddef.h")
target_include_directories(app PRIVATE . ${BP}/include ${BT}/src ${BT}/platform/zephyr ${BT}/platform/embedded ${BT}/chipset/zephyr ${BT}/3rd-party/micro-ecc ${BT}/3rd-party/rijndael)
target_compile_options(app PRIVATE -Wno-unused-function -Wno-unused-variable)

option(ENABLE_NEZHA_ADAPTER "Compile/link the uninvoked Nezha I2C adapter" OFF)
option(ENABLE_MOTOR_BENCH "Button-started finite loose-motor sequence" OFF)
if(ENABLE_MOTOR_BENCH)
 if(ENABLE_NEZHA_ADAPTER)
  message(FATAL_ERROR "Choose motor bench or compile-only adapter, not both")
 endif()
 target_sources(app PRIVATE motor_bench.c)
 target_compile_definitions(app PRIVATE ENABLE_MOTOR_BENCH=1)
endif()
if(ENABLE_NEZHA_ADAPTER)
 target_sources(app PRIVATE nezha_adapter.c)
 # Retain the primitive for link verification. This does NOT call the function.
 zephyr_link_libraries(-Wl,--undefined=nezha_write_motor)
endif()
